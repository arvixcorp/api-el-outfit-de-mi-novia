import sharp from "sharp";
import type { Rgba } from "./image.js";

export interface ExtractedColors {
  dominante: string;
  secundarios: string[];
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

const dist = (a: number[], b: number[]) =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

/**
 * Colores de la prenda: agrupa los pixeles opacos en cubos de 16 niveles por canal,
 * y elige los mas frecuentes que sean visualmente distintos entre si.
 */
export function extractColorsFromRgba(rgba: Rgba, maxSecondary = 3, minDistance = 48): ExtractedColors | null {
  const { data, width, height } = rgba;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if ((data[o + 3] ?? 0) < 200) continue; // ignora transparencia y bordes suaves
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.count++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  if (buckets.size === 0) return null;

  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map((c) => [c.r / c.count, c.g / c.count, c.b / c.count]);

  const picked: number[][] = [];
  for (const c of ranked) {
    if (picked.every((p) => dist(p, c) >= minDistance)) picked.push(c);
    if (picked.length === maxSecondary + 1) break;
  }

  const [first, ...rest] = picked;
  if (!first) return null;
  return {
    dominante: toHex(first[0]!, first[1]!, first[2]!),
    secundarios: rest.map((c) => toHex(c[0]!, c[1]!, c[2]!)),
  };
}

export async function extractColors(png: Buffer): Promise<ExtractedColors | null> {
  const { data, info } = await sharp(png)
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return extractColorsFromRgba({ data, width: info.width, height: info.height });
}
