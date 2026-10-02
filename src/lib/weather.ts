import { logger } from "../config/logger.js";

export interface Weather {
  temperaturaC: number;
  lluvia: boolean;
  descripcion: string;
  ciudad: string;
}

const cache = new Map<string, { at: number; value: Weather }>();
const TTL_MS = 30 * 60 * 1000;

/** Codigos WMO de lluvia, llovizna, chubascos y tormenta. */
const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

const DESCRIPCION: Record<number, string> = {
  0: "despejado",
  1: "mayormente despejado",
  2: "parcialmente nublado",
  3: "nublado",
  45: "niebla",
  48: "niebla",
  51: "llovizna",
  53: "llovizna",
  55: "llovizna",
  61: "lluvia ligera",
  63: "lluvia",
  65: "lluvia fuerte",
  71: "nieve",
  73: "nieve",
  75: "nieve",
  80: "chubascos",
  81: "chubascos",
  82: "chubascos fuertes",
  95: "tormenta",
};

/** Clima actual por ciudad con Open-Meteo (gratis, sin API key). Devuelve null si falla. */
export async function weatherForCity(ciudad: string): Promise<Weather | null> {
  const key = ciudad.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`,
      { signal: AbortSignal.timeout(8000) },
    );
    const place = ((await geo.json()) as { results?: { latitude: number; longitude: number; name: string }[] })
      .results?.[0];
    if (!place) return null;

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,precipitation`,
      { signal: AbortSignal.timeout(8000) },
    );
    const current = ((await res.json()) as {
      current?: { temperature_2m: number; weather_code: number; precipitation: number };
    }).current;
    if (!current) return null;

    const value: Weather = {
      temperaturaC: Math.round(current.temperature_2m),
      lluvia: WET_CODES.has(current.weather_code) || current.precipitation > 0.2,
      descripcion: DESCRIPCION[current.weather_code] ?? "variable",
      ciudad: place.name,
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    logger.warn(`No se pudo obtener el clima de ${ciudad}: ${String(err)}`);
    return null;
  }
}
