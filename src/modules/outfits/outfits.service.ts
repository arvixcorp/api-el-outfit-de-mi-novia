import { createHash } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { Garment, Outfit, OutfitItem } from "../../generated/prisma/client.js";
import { AppError, NotFoundError } from "../../common/errors/AppError.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { weatherForCity } from "../../lib/weather.js";
import { isAiConfigured } from "../../lib/ai.js";
import { serializeGarment } from "../garments/garments.service.js";
import { colorName } from "./color.js";
import { analyzeGaps } from "./gaps.js";
import { fallbackFromCandidates, validateAiOutfits, type ValidatedOutfit } from "./ai-schema.js";
import { pickOutfitsWithAi } from "./ai-recommend.js";
import {
  buildCandidates,
  CAPA_POR_CATEGORIA,
  filterGarments,
  type Categoria,
  type Ocasion,
  type RGarment,
  type RuleContext,
} from "./rules.js";
import type {
  CompleteInput,
  CreateOutfitInput,
  ListOutfitsQuery,
  RecommendInput,
  UpdateOutfitInput,
} from "./outfits.schemas.js";

type OutfitWithItems = Outfit & { items: (OutfitItem & { garment: Garment })[] };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const includeItems = { items: { include: { garment: true }, orderBy: { posicion: "asc" as const } } };

const dateOnly = (s?: string): Date => new Date(`${s ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toRGarment(g: Garment): RGarment {
  return {
    id: g.id,
    categoria: g.categoria as Categoria,
    subcategoria: g.subcategoria,
    colorHex: g.colorDominanteHex,
    patron: g.patron,
    material: g.material,
    formalidad: g.formalidad,
    temporadas: asStrings(g.temporadas),
    ocasiones: asStrings(g.ocasiones),
    favorito: g.favorito,
    ultimaVezUsada: g.ultimaVezUsada,
  };
}

async function serializeOutfit(o: OutfitWithItems) {
  const { items, ...rest } = o;
  return {
    ...rest,
    items: await Promise.all(
      items.map(async (i) => ({ posicion: i.posicion, layout: i.layout, garment: await serializeGarment(i.garment) })),
    ),
  };
}

async function loadOutfits(userId: string, ids: string[]) {
  const rows = await prisma.outfit.findMany({ where: { id: { in: ids }, userId }, include: includeItems });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return rows;
}

async function findOwnedOutfit(userId: string, id: string) {
  const outfit = await prisma.outfit.findFirst({ where: { id, userId }, include: includeItems });
  if (!outfit) throw new NotFoundError("Outfit no encontrado");
  return outfit;
}

async function assertGarmentsOwned(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const count = await prisma.garment.count({ where: { id: { in: unique }, userId, deletedAt: null } });
  if (count !== unique.length) throw new NotFoundError("Alguna prenda no existe");
  return unique;
}

function describeOutfit(o: OutfitWithItems): string {
  return o.items
    .map((i) => `${i.garment.subcategoria ?? i.garment.categoria ?? "prenda"} ${colorName(i.garment.colorDominanteHex)}`)
    .join(" + ");
}

async function feedbackExamples(userId: string) {
  const fetch = (rating: "me_gusta" | "no_me_gusta") =>
    prisma.outfitFeedback.findMany({
      where: { rating, outfit: { userId } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { outfit: { include: includeItems } },
    });
  const [liked, disliked] = await Promise.all([fetch("me_gusta"), fetch("no_me_gusta")]);
  const text = (f: (typeof liked)[number]) =>
    `${describeOutfit(f.outfit)}${f.comentario ? ` (comentario: ${f.comentario})` : ""}`;
  return { meGustaron: liked.map(text), noMeGustaron: disliked.map(text), total: liked.length + disliked.length };
}

async function recentGarmentIds(userId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - RECENT_DAYS * DAY_MS);
  const logs = await prisma.wearLog.findMany({
    where: { userId, fecha: { gte: since }, outfitId: { not: null } },
    include: { outfit: { include: { items: true } } },
  });
  const ids = new Set<string>();
  for (const l of logs) for (const i of l.outfit?.items ?? []) ids.add(i.garmentId);
  return ids;
}

async function aiCallsToday(userId: string): Promise<number> {
  const row = await prisma.aiUsage.findUnique({ where: { userId_fecha: { userId, fecha: dateOnly() } } });
  return row?.llamadas ?? 0;
}

async function countAiCall(userId: string) {
  const fecha = dateOnly();
  await prisma.aiUsage.upsert({
    where: { userId_fecha: { userId, fecha } },
    create: { userId, fecha, llamadas: 1 },
    update: { llamadas: { increment: 1 } },
  });
}

async function saveRecommended(userId: string, items: ValidatedOutfit[], pool: RGarment[], meta: {
  ocasion?: string | undefined;
  clima: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  fromAi: boolean;
}) {
  const byId = new Map(pool.map((g) => [g.id, g]));
  const ids: string[] = [];
  for (const o of items) {
    const created = await prisma.outfit.create({
      data: {
        userId,
        nombre: o.nombre,
        origen: "ia",
        ocasion: meta.ocasion ?? null,
        climaContexto: meta.clima,
        explicacionIa: o.explicacion,
        items: {
          create: o.ids.map((garmentId) => ({
            garmentId,
            posicion: CAPA_POR_CATEGORIA[byId.get(garmentId)!.categoria],
          })),
        },
      },
    });
    ids.push(created.id);
  }
  return ids;
}

export const outfitsService = {
  /** Recomendacion en dos etapas: reglas en el backend -> seleccion con la IA. */
  async recommend(userId: string, input: RecommendInput | (CompleteInput & { prendaObligatoria?: undefined })) {
    const required = "prendas" in input && input.prendas ? input.prendas : input.prendaObligatoria ? [input.prendaObligatoria] : [];

    const [user, rows] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.garment.findMany({
        where: { userId, deletedAt: null, estadoProcesamiento: "ready", categoria: { not: null } },
      }),
    ]);
    if (!user) throw new NotFoundError("Usuaria no encontrada");
    if (rows.length < 2) {
      throw new AppError("Necesitas al menos un par de prendas listas en tu armario para recibir recomendaciones", 422, "NOT_ENOUGH_GARMENTS");
    }

    const all = rows.map(toRGarment);
    for (const id of required) {
      if (!all.some((g) => g.id === id)) throw new NotFoundError("La prenda obligatoria no está disponible");
    }

    // Clima: manual si lo envia, si no automatico por ciudad.
    let temperaturaC = input.temperaturaC;
    let lluvia = input.lluvia;
    let climaDescripcion: string | undefined;
    if (temperaturaC === undefined && user.ciudad) {
      const w = await weatherForCity(user.ciudad);
      if (w) {
        temperaturaC = w.temperaturaC;
        lluvia ??= w.lluvia;
        climaDescripcion = `${w.descripcion} en ${w.ciudad}`;
      }
    }
    const clima = { temperaturaC, lluvia, descripcion: climaDescripcion };

    const recientes = await recentGarmentIds(userId);
    const ctx: RuleContext = {
      ocasion: input.ocasion as Ocasion | undefined,
      temperaturaC,
      lluvia,
      requeridas: required,
      recientes,
    };

    const pool = filterGarments(all, ctx);
    const candidates = buildCandidates(pool, ctx);
    if (candidates.length === 0) {
      const tips = analyzeGaps(all).slice(0, 2).map((g) => g.mensaje);
      throw new AppError(
        `No encontré combinaciones válidas con tus prendas para esta situación. ${tips.join(" ")}`.trim(),
        422,
        "NO_CANDIDATES",
      );
    }

    const feedback = await feedbackExamples(userId);
    const clavePayload = JSON.stringify({
      userId,
      day: new Date().toISOString().slice(0, 10),
      ocasion: input.ocasion ?? null,
      clima: [temperaturaC ?? null, lluvia ?? null],
      estilo: input.estilo ?? null,
      required,
      cand: candidates.map((c) => c.ids.join(",")).sort(),
      fb: feedback.total,
    });
    const clave = createHash("sha256").update(clavePayload).digest("hex");

    // Cache: misma peticion + mismo armario = misma respuesta.
    if (!input.forzar) {
      const cached = await prisma.recommendationCache.findUnique({ where: { userId_clave: { userId, clave } } });
      if (cached && Date.now() - cached.createdAt.getTime() < CACHE_TTL_MS) {
        const { outfitIds, fuente } = cached.resultado as { outfitIds: string[]; fuente: string };
        const outfits = await loadOutfits(userId, outfitIds);
        const intact = outfits.length === outfitIds.length && outfits.every((o) => o.items.every((i) => !i.garment.deletedAt));
        if (intact) {
          return { outfits: await Promise.all(outfits.map(serializeOutfit)), clima, fuente, desdeCache: true };
        }
      }
    }

    // Etapa 2: IA, con limite diario. Si no se puede, se usan las mejores por reglas.
    let validated: ValidatedOutfit[] = [];
    let fuente: "ia" | "reglas" = "reglas";
    let aviso: string | undefined;

    const usadas = await aiCallsToday(userId);
    if (!isAiConfigured()) {
      aviso = "La IA no está configurada; te muestro combinaciones armadas por reglas.";
    } else if (usadas >= env.AI_DAILY_LIMIT) {
      aviso = "Llegaste al límite diario de recomendaciones con IA; te muestro combinaciones armadas por reglas.";
    } else {
      try {
        await countAiCall(userId);
        const parsed = await pickOutfitsWithAi({
          pool,
          candidates,
          ocasion: input.ocasion,
          clima,
          estilo: input.estilo,
          estiloPreferido: user.estiloPreferido,
          requeridas: required,
          meGustaron: feedback.meGustaron,
          noMeGustaron: feedback.noMeGustaron,
        });
        validated = validateAiOutfits(parsed, pool, required);
        if (validated.length > 0) fuente = "ia";
      } catch (err) {
        logger.warn(`Recomendación con IA falló: ${String(err instanceof Error ? err.message : err)}`);
        aviso = "No pude consultar a la IA ahora; te muestro combinaciones armadas por reglas.";
      }
    }
    if (validated.length === 0) validated = fallbackFromCandidates(candidates);

    const outfitIds = await saveRecommended(userId, validated, pool, {
      ocasion: input.ocasion,
      clima: clima as Prisma.InputJsonValue,
      fromAi: fuente === "ia",
    });

    // Solo se cachean las respuestas de la IA (las de reglas se recalculan gratis).
    if (fuente === "ia") {
      const resultado = { outfitIds, fuente } as Prisma.InputJsonValue;
      await prisma.recommendationCache.upsert({
        where: { userId_clave: { userId, clave } },
        create: { userId, clave, resultado },
        update: { resultado, createdAt: new Date() },
      });
    }

    const outfits = await loadOutfits(userId, outfitIds);
    return { outfits: await Promise.all(outfits.map(serializeOutfit)), clima, fuente, aviso, desdeCache: false };
  },

  complete(userId: string, input: CompleteInput) {
    return this.recommend(userId, input);
  },

  async gaps(userId: string) {
    const rows = await prisma.garment.findMany({
      where: { userId, deletedAt: null, estadoProcesamiento: "ready", categoria: { not: null } },
    });
    return { totalPrendas: rows.length, huecos: analyzeGaps(rows.map(toRGarment)) };
  },

  async createManual(userId: string, input: CreateOutfitInput) {
    await assertGarmentsOwned(userId, input.items.map((i) => i.garmentId));
    const outfit = await prisma.outfit.create({
      data: {
        userId,
        nombre: input.nombre ?? null,
        origen: "manual",
        ocasion: input.ocasion ?? null,
        guardado: true,
        items: {
          create: [...new Map(input.items.map((i) => [i.garmentId, i])).values()].map((i) => ({
            garmentId: i.garmentId,
            posicion: i.posicion,
            layout: i.layout ?? Prisma.JsonNull,
          })),
        },
      },
      include: includeItems,
    });
    return serializeOutfit(outfit);
  },

  async list(userId: string, q: ListOutfitsQuery) {
    const rows = await prisma.outfit.findMany({
      where: {
        userId,
        ...(q.guardado !== undefined && { guardado: q.guardado }),
        ...(q.favorito !== undefined && { favorito: q.favorito }),
        ...(q.origen && { origen: q.origen }),
        ...(q.garmentId && { items: { some: { garmentId: q.garmentId } } }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      include: includeItems,
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    return {
      items: await Promise.all(page.map(serializeOutfit)),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  },

  async get(userId: string, id: string) {
    return serializeOutfit(await findOwnedOutfit(userId, id));
  },

  async update(userId: string, id: string, input: UpdateOutfitInput) {
    await findOwnedOutfit(userId, id);
    const { items, ...fields } = input;
    if (items) await assertGarmentsOwned(userId, items.map((i) => i.garmentId));

    await prisma.$transaction(async (tx) => {
      await tx.outfit.update({ where: { id }, data: fields });
      if (items) {
        await tx.outfitItem.deleteMany({ where: { outfitId: id } });
        await tx.outfitItem.createMany({
          data: [...new Map(items.map((i) => [i.garmentId, i])).values()].map((i) => ({
            outfitId: id,
            garmentId: i.garmentId,
            posicion: i.posicion,
            layout: i.layout ?? Prisma.JsonNull,
          })),
        });
      }
    });
    return serializeOutfit(await findOwnedOutfit(userId, id));
  },

  async remove(userId: string, id: string) {
    await findOwnedOutfit(userId, id);
    await prisma.outfit.delete({ where: { id } });
  },

  async addFeedback(userId: string, id: string, rating: "me_gusta" | "no_me_gusta", comentario?: string) {
    await findOwnedOutfit(userId, id);
    return prisma.outfitFeedback.create({ data: { outfitId: id, rating, comentario: comentario ?? null } });
  },

  /** Registra que uso el outfit: calendario + contadores de cada prenda. */
  async markWorn(userId: string, id: string, fecha?: string) {
    const outfit = await findOwnedOutfit(userId, id);
    const day = dateOnly(fecha);
    const ids = outfit.items.map((i) => i.garmentId);

    const [log] = await prisma.$transaction([
      prisma.wearLog.create({ data: { userId, outfitId: id, fecha: day } }),
      prisma.garment.updateMany({ where: { id: { in: ids }, userId }, data: { vecesUsada: { increment: 1 }, ultimaVezUsada: day } }),
      // Usar un outfit sugerido equivale a guardarlo.
      prisma.outfit.update({ where: { id }, data: { guardado: true } }),
    ]);
    return log;
  },

  async wearLog(userId: string, desde: string, hasta: string) {
    const rows = await prisma.wearLog.findMany({
      where: { userId, fecha: { gte: dateOnly(desde), lte: dateOnly(hasta) } },
      orderBy: { fecha: "asc" },
      include: { outfit: { include: includeItems } },
    });
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        fecha: r.fecha.toISOString().slice(0, 10),
        outfit: r.outfit ? await serializeOutfit(r.outfit) : null,
      })),
    );
  },

  async removeWear(userId: string, logId: string) {
    const log = await prisma.wearLog.findFirst({ where: { id: logId, userId } });
    if (!log) throw new NotFoundError("Registro no encontrado");
    await prisma.wearLog.delete({ where: { id: logId } });
  },
};
