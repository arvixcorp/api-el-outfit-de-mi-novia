import { z } from "zod";
import { CATEGORIAS, OCASIONES, PATRONES, TEMPORADAS } from "../garments/garments.schemas.js";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Respuesta estricta esperada del modelo al etiquetar una prenda. */
export const taggingSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  subcategoria: z.string().trim().min(1).max(100),
  colores: z
    .array(z.object({ nombre: z.string().trim().min(1).max(40), hex }))
    .min(1)
    .max(4),
  patron: z.enum(PATRONES),
  material: z.string().trim().min(1).max(100),
  formalidad: z.number().int().min(1).max(5),
  temporadas: z.array(z.enum(TEMPORADAS)).min(1).max(4),
  ocasiones: z.array(z.enum(OCASIONES)).min(1).max(6),
  descripcion: z.string().trim().min(1).max(300),
});

export type Tagging = z.infer<typeof taggingSchema>;

/** Extrae el primer objeto JSON de un texto (tolera ```json ... ``` y texto alrededor). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("La respuesta no contiene JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseTagging(text: string): Tagging {
  return taggingSchema.parse(extractJson(text));
}
