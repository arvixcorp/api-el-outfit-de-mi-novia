import sharp from "sharp";
import { encode } from "blurhash";

export interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

/** Corrige orientacion EXIF y limita el lado largo. Devuelve JPEG. */
export async function normalizeOriginal(input: Buffer, maxSide = 2048): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Caja que contiene los pixeles no transparentes (alpha > umbral). */
export function opaqueBounds(
  rgba: Rgba,
  alphaThreshold = 10,
): { left: number; top: number; width: number; height: number } | null {
  const { data, width, height } = rgba;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function toRgba(png: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Recorta al contenido (trim por alpha), centra con padding uniforme y
 * limita el tamaño. Devuelve PNG con transparencia y sus dimensiones.
 */
export async function cropAndCenter(
  png: Buffer,
  opts: { paddingRatio?: number; maxSide?: number } = {},
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { paddingRatio = 0.08, maxSide = 1600 } = opts;
  const rgba = await toRgba(png);
  const box = opaqueBounds(rgba);
  if (!box) throw new Error("La imagen sin fondo quedó vacía (todo transparente)");

  const cropped = await sharp(png).extract(box).png().toBuffer();
  const pad = Math.max(2, Math.round(Math.max(box.width, box.height) * paddingRatio));

  const out = await sharp(cropped)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

export async function makeThumbnail(png: Buffer, size = 480): Promise<Buffer> {
  return sharp(png)
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
}

/** Blurhash calculado sobre un fondo crema para que los placeholders no salgan negros. */
export async function makeBlurhash(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png)
    .resize(32, 32, { fit: "inside" })
    .flatten({ background: { r: 245, g: 240, b: 232 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}

/** JPEG sobre fondo neutro para enviar a la IA (menos tokens que un PNG grande). */
export async function forAiVision(png: Buffer, maxSide = 896): Promise<Buffer> {
  return sharp(png)
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 85 })
    .toBuffer();
}
