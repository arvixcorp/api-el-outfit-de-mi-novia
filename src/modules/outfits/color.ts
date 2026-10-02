export interface Hsl {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

export function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Negro, blanco, grises, beige/crema/camel suaves: combinan con casi todo. */
export function isNeutral(hex: string | null | undefined): boolean {
  if (!hex) return true;
  const hsl = hexToHsl(hex);
  if (!hsl) return true;
  if (hsl.s < 0.15 || hsl.l < 0.12 || hsl.l > 0.9) return true;
  // tonos tierra desaturados (beige, camel, crema)
  return hsl.h >= 20 && hsl.h <= 50 && hsl.s < 0.45;
}

/** Nombre aproximado en español de un color hex (para describir prendas al modelo). */
export function colorName(hex: string | null | undefined): string {
  const hsl = hex ? hexToHsl(hex) : null;
  if (!hsl) return "color desconocido";
  const { h, s, l } = hsl;
  if (l < 0.12) return "negro";
  if (l > 0.92) return "blanco";
  if (s < 0.12) return l < 0.35 ? "gris oscuro" : l > 0.7 ? "gris claro" : "gris";
  if (h >= 20 && h <= 50 && s < 0.45) return l > 0.7 ? "crema" : l > 0.45 ? "beige" : "café";
  const tono =
    h < 15 || h >= 345 ? "rojo"
    : h < 40 ? "naranja"
    : h < 65 ? "amarillo"
    : h < 160 ? "verde"
    : h < 195 ? "turquesa"
    : h < 255 ? "azul"
    : h < 290 ? "violeta"
    : "rosa";
  return l < 0.3 ? `${tono} oscuro` : l > 0.72 ? `${tono} claro` : tono;
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Puntaje de armonia (mayor es mejor) para una lista de colores hex:
 * neutros combinan; analogos y complementarios suman; mas de 2 tonos fuertes restan.
 */
export function colorHarmonyScore(hexes: (string | null | undefined)[]): number {
  const hues: number[] = [];
  for (const hex of hexes) {
    if (isNeutral(hex)) continue;
    const hsl = hexToHsl(hex!);
    if (hsl && !hues.some((h) => hueDistance(h, hsl.h) < 25)) hues.push(hsl.h);
  }
  if (hues.length <= 1) return 2;
  if (hues.length === 2) {
    const d = hueDistance(hues[0]!, hues[1]!);
    if (d < 45) return 2; // analogos
    if (d >= 150) return 1.5; // complementarios
    return -1;
  }
  return -2.5;
}
