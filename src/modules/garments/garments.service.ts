import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { storage } from "../../lib/storage.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { Garment } from "../../generated/prisma/client.js";
import { AppError, NotFoundError } from "../../common/errors/AppError.js";
import { logger } from "../../config/logger.js";
import { processingWorker } from "../processing/worker.js";
import {
  CONTENT_TYPES,
  type ListGarmentsQuery,
  type UpdateGarmentInput,
  type UploadUrlInput,
} from "./garments.schemas.js";

/** Convierte las claves de storage guardadas en la base a URLs consumibles por la app. */
async function serialize(g: Garment) {
  const { confirmedAt, deletedAt: _d, procesandoDesde: _p, proximoIntento: _n, ...rest } = g;
  const [urlOriginal, urlSinFondo, urlThumbnail] = await Promise.all([
    storage.urlFor(g.urlOriginal),
    storage.urlFor(g.urlSinFondo),
    storage.urlFor(g.urlThumbnail),
  ]);
  return { ...rest, urlOriginal, urlSinFondo, urlThumbnail, subido: confirmedAt !== null };
}

export { serialize as serializeGarment };

async function findOwned(userId: string, id: string): Promise<Garment> {
  const garment = await prisma.garment.findFirst({ where: { id, userId, deletedAt: null } });
  if (!garment) throw new NotFoundError("Prenda no encontrada");
  return garment;
}

/** Ids de prendas cuyo arreglo JSON contiene el valor (MySQL no filtra arrays con Prisma). */
async function idsWithJsonValue(userId: string, column: "temporadas" | "ocasiones", value: string) {
  const col = Prisma.raw(column);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM garments
    WHERE user_id = ${userId} AND deleted_at IS NULL
      AND JSON_CONTAINS(${col}, JSON_QUOTE(${value}))`;
  return rows.map((r) => r.id);
}

export const garmentsService = {
  /** Paso 1 del flujo de subida: crea la prenda en `pending` y entrega la URL prefirmada. */
  async createUpload(userId: string, input: UploadUrlInput) {
    const id = randomUUID();
    const key = `users/${userId}/garments/${id}/original.${CONTENT_TYPES[input.contentType]}`;
    const uploadUrl = await storage.presignUpload(key, input.contentType, input.sizeBytes);

    await prisma.garment.create({
      data: { id, userId, urlOriginal: key, estadoProcesamiento: "pending" },
    });

    return {
      garmentId: id,
      upload: {
        method: "PUT" as const,
        url: uploadUrl,
        headers: { "Content-Type": input.contentType },
        expiresInSeconds: storage.uploadUrlTtl,
      },
    };
  },

  /** Renueva la URL prefirmada de una prenda cuya subida aun no se confirmo (URL vencida o reintento). */
  async renewUpload(userId: string, id: string, input: UploadUrlInput) {
    const garment = await findOwned(userId, id);
    if (garment.confirmedAt) throw new AppError("La subida ya fue confirmada", 409, "ALREADY_CONFIRMED");
    if (!garment.urlOriginal) throw new AppError("La prenda no tiene imagen", 409, "NO_ORIGINAL");

    const ext = CONTENT_TYPES[input.contentType];
    const key = garment.urlOriginal.replace(/\.[a-z0-9]+$/i, `.${ext}`);
    if (key !== garment.urlOriginal) await prisma.garment.update({ where: { id }, data: { urlOriginal: key } });

    const uploadUrl = await storage.presignUpload(key, input.contentType, input.sizeBytes);
    return {
      garmentId: id,
      upload: {
        method: "PUT" as const,
        url: uploadUrl,
        headers: { "Content-Type": input.contentType },
        expiresInSeconds: storage.uploadUrlTtl,
      },
    };
  },

  /** Paso 5: la app avisa que termino de subir. Verifica el objeto en el storage. */
  async confirmUpload(userId: string, id: string) {
    const garment = await findOwned(userId, id);
    if (!garment.urlOriginal) throw new AppError("La prenda no tiene imagen", 409, "NO_ORIGINAL");

    if (garment.confirmedAt) return serialize(garment); // idempotente

    let size: number | null;
    try {
      size = await storage.objectSize(garment.urlOriginal);
    } catch (err) {
      logger.error(`No se pudo verificar la imagen ${garment.urlOriginal}`, err);
      throw new AppError("No se pudo verificar la imagen en el almacenamiento, intenta de nuevo", 502, "STORAGE_UNAVAILABLE");
    }
    if (size === null) {
      throw new AppError("La imagen aún no está en el almacenamiento", 409, "UPLOAD_MISSING");
    }

    // Queda `pending` + confirmada: el worker la toma de la cola.
    const updated = await prisma.garment.update({
      where: { id },
      data: { confirmedAt: new Date(), estadoProcesamiento: "pending", intentos: 0, proximoIntento: null },
    });
    processingWorker.kick();
    return serialize(updated);
  },

  /** Reintenta el procesamiento de una prenda fallida (la original se conserva). */
  async retry(userId: string, id: string) {
    const garment = await findOwned(userId, id);
    if (!garment.confirmedAt) throw new AppError("La subida de la prenda no se ha confirmado", 409, "NOT_CONFIRMED");
    if (garment.estadoProcesamiento === "processing") {
      throw new AppError("La prenda ya se está procesando", 409, "ALREADY_PROCESSING");
    }
    const updated = await prisma.garment.update({
      where: { id },
      data: {
        estadoProcesamiento: "pending",
        intentos: 0,
        errorProcesamiento: null,
        proximoIntento: null,
        procesandoDesde: null,
      },
    });
    processingWorker.kick();
    return serialize(updated);
  },

  async list(userId: string, q: ListGarmentsQuery) {
    const and: Prisma.GarmentWhereInput[] = [];
    if (q.temporada) and.push({ id: { in: await idsWithJsonValue(userId, "temporadas", q.temporada) } });
    if (q.ocasion) and.push({ id: { in: await idsWithJsonValue(userId, "ocasiones", q.ocasion) } });
    if (q.q) {
      and.push({
        OR: [
          { subcategoria: { contains: q.q } },
          { marca: { contains: q.q } },
          { material: { contains: q.q } },
          { notas: { contains: q.q } },
        ],
      });
    }

    const where: Prisma.GarmentWhereInput = {
      userId,
      deletedAt: null,
      confirmedAt: { not: null },
      ...(q.categoria && { categoria: q.categoria }),
      ...(q.estado && { estadoProcesamiento: q.estado }),
      ...(q.favorito !== undefined && { favorito: q.favorito }),
      ...(q.color && { colorDominanteHex: q.color.toLowerCase() }),
      ...(and.length && { AND: and }),
    };

    const rows = await prisma.garment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return {
      items: await Promise.all(page.map(serialize)),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  },

  async get(userId: string, id: string) {
    return serialize(await findOwned(userId, id));
  },

  async update(userId: string, id: string, input: UpdateGarmentInput) {
    await findOwned(userId, id);

    const { temporadas, ocasiones, colorDominanteHex, ...rest } = input;
    const updated = await prisma.garment.update({
      where: { id },
      data: {
        ...rest,
        ...(temporadas && { temporadas }),
        ...(ocasiones && { ocasiones }),
        ...(colorDominanteHex !== undefined && {
          colorDominanteHex: colorDominanteHex?.toLowerCase() ?? null,
        }),
      },
    });
    return serialize(updated);
  },

  /** Borrado logico: la fila se conserva (outfits e historial siguen validos). */
  async remove(userId: string, id: string) {
    const garment = await findOwned(userId, id);
    await prisma.garment.update({ where: { id }, data: { deletedAt: new Date() } });

    // Las imagenes se borran del storage en segundo plano; un fallo no debe romper la peticion.
    const keys = [garment.urlOriginal, garment.urlSinFondo, garment.urlThumbnail].filter((k): k is string => !!k);
    void Promise.allSettled(keys.map((k) => storage.remove(k))).then((results) => {
      for (const r of results) if (r.status === "rejected") logger.warn("No se pudo borrar un objeto del storage", r.reason);
    });
  },
};
