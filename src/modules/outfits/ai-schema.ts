import { z } from "zod";
import { extractJson } from "../processing/tagging.schema.js";
import { isValidCombo, type Candidate, type RGarment } from "./rules.js";

/** Respuesta estricta del modelo al elegir los mejores outfits. */
export const aiOutfitsSchema = z.object({
  outfits: z
    .array(
      z.object({
        prendas: z.array(z.string()).min(2).max(8),
        nombre: z.string().trim().min(1).max(80),
        explicacion: z.string().trim().min(1).max(700),
      }),
    )
    .min(1)
    .max(6), // tolerante: si el modelo manda de más, validateAiOutfits se queda con 3
});

export interface ValidatedOutfit {
  ids: string[];
  nombre: string;
  explicacion: string;
}

export function parseAiOutfits(text: string) {
  return aiOutfitsSchema.parse(extractJson(text));
}

/**
 * Verifica en el backend lo que dijo el modelo: solo IDs existentes, sin repetir,
 * una combinacion valida y que incluya las prendas obligatorias. Lo que no cumple se descarta.
 */
export function validateAiOutfits(
  parsed: z.infer<typeof aiOutfitsSchema>,
  pool: RGarment[],
  required: string[] = [],
): ValidatedOutfit[] {
  const byId = new Map(pool.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const out: ValidatedOutfit[] = [];

  for (const o of parsed.outfits) {
    const ids = [...new Set(o.prendas)];
    if (ids.length !== o.prendas.length) continue;
    if (!ids.every((id) => byId.has(id))) continue;
    if (!required.every((id) => ids.includes(id))) continue;
    if (!isValidCombo(ids.map((id) => byId.get(id)!))) continue;
    const key = [...ids].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ids, nombre: o.nombre, explicacion: o.explicacion });
  }
  return out.slice(0, 3);
}

/** Si la IA falla o no devuelve nada valido, se usan las mejores combinaciones por reglas. */
export function fallbackFromCandidates(candidates: Candidate[], n = 3): ValidatedOutfit[] {
  return candidates.slice(0, n).map((c, i) => ({
    ids: c.ids,
    nombre: `Opción ${i + 1}`,
    explicacion: "Combinación sugerida por armonía de colores, formalidad y prendas que no has usado hace poco.",
  }));
}
