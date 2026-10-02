import type { Garment } from "../../generated/prisma/client.js";
import { Prisma } from "../../generated/prisma/client.js";
import { storage } from "../../lib/storage.js";
import { logger } from "../../config/logger.js";
import { removeBackground } from "./bg-removal.js";
import { extractColors } from "./colors.js";
import { cropAndCenter, forAiVision, makeBlurhash, makeThumbnail, normalizeOriginal } from "./image.js";
import { tagGarment } from "./ai-tagging.js";
import type { Tagging } from "./tagging.schema.js";

/**
 * Procesa una prenda: normaliza -> quita fondo -> recorta/centra -> thumbnail, blurhash,
 * colores -> etiqueta con IA. Devuelve los campos a guardar cuando queda `ready`.
 * Lanza si falla algun paso imprescindible (la original nunca se toca).
 * El etiquetado con IA no es imprescindible: si falla, la prenda queda lista sin etiquetas.
 */
export async function processGarment(garment: Garment): Promise<Prisma.GarmentUpdateInput> {
  if (!garment.urlOriginal) throw new Error("La prenda no tiene imagen original");
  const base = `users/${garment.userId}/garments/${garment.id}`;

  const original = await storage.getBuffer(garment.urlOriginal);
  const normalized = await normalizeOriginal(original);

  const cutout = await removeBackground(normalized);
  const { buffer: png, width, height } = await cropAndCenter(cutout);

  const [thumb, blurhash, colors] = await Promise.all([makeThumbnail(png), makeBlurhash(png), extractColors(png)]);

  const keySinFondo = `${base}/sin-fondo.png`;
  const keyThumb = `${base}/thumb.webp`;
  await Promise.all([
    storage.putBuffer(keySinFondo, png, "image/png"),
    storage.putBuffer(keyThumb, thumb, "image/webp"),
  ]);

  let tags: Tagging | null = null;
  let aiNote: string | null = null;
  try {
    tags = await tagGarment(await forAiVision(png));
  } catch (err) {
    aiNote = `Etiquetado con IA no disponible: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`;
    logger.warn(`Prenda ${garment.id}: ${aiNote}`);
  }

  const secundarios = tags
    ? tags.colores.slice(1)
    : (colors?.secundarios ?? []).map((hex) => ({ nombre: null, hex }));

  return {
    estadoProcesamiento: "ready",
    urlSinFondo: keySinFondo,
    urlThumbnail: keyThumb,
    blurhash,
    ancho: width,
    alto: height,
    colorDominanteHex: colors?.dominante ?? tags?.colores[0]?.hex.toLowerCase() ?? null,
    coloresSecundarios: secundarios.length ? (secundarios as Prisma.InputJsonValue) : Prisma.JsonNull,
    ...(tags && {
      categoria: tags.categoria,
      subcategoria: tags.subcategoria,
      patron: tags.patron,
      material: tags.material,
      formalidad: tags.formalidad,
      temporadas: tags.temporadas,
      ocasiones: tags.ocasiones,
      descripcionIa: tags.descripcion,
    }),
    errorProcesamiento: aiNote,
    procesandoDesde: null,
    proximoIntento: null,
  };
}
