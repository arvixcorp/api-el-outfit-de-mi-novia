import { z } from "zod";

export const CATEGORIAS = ["top", "bottom", "vestido", "outerwear", "calzado", "bolso", "accesorio"] as const;
export const PATRONES = ["liso", "rayas", "cuadros", "floral", "estampado", "otro"] as const;
export const ESTADOS = ["pending", "processing", "ready", "failed"] as const;
export const TEMPORADAS = ["primavera", "verano", "otoño", "invierno"] as const;
export const OCASIONES = ["casual", "trabajo", "cita", "fiesta", "deporte", "viaje"] as const;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
} as const;

export const uploadUrlSchema = z.object({
  contentType: z.enum(Object.keys(CONTENT_TYPES) as [keyof typeof CONTENT_TYPES, ...(keyof typeof CONTENT_TYPES)[]]),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, "La imagen supera el máximo de 15 MB"),
});

export const idParamsSchema = z.object({ id: z.uuid("Id inválido") });

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (#RRGGBB)");

export const updateGarmentSchema = z
  .object({
    categoria: z.enum(CATEGORIAS).nullable(),
    subcategoria: z.string().trim().max(100).nullable(),
    patron: z.enum(PATRONES).nullable(),
    material: z.string().trim().max(100).nullable(),
    formalidad: z.number().int().min(1).max(5).nullable(),
    temporadas: z.array(z.enum(TEMPORADAS)).max(4),
    ocasiones: z.array(z.enum(OCASIONES)).max(6),
    marca: z.string().trim().max(100).nullable(),
    notas: z.string().trim().max(2000).nullable(),
    favorito: z.boolean(),
    colorDominanteHex: hex.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No hay campos para actualizar");

const boolFromQuery = z.enum(["true", "false"]).transform((v) => v === "true");

export const listGarmentsSchema = z.object({
  categoria: z.enum(CATEGORIAS).optional(),
  estado: z.enum(ESTADOS).optional(),
  favorito: boolFromQuery.optional(),
  temporada: z.enum(TEMPORADAS).optional(),
  ocasion: z.enum(OCASIONES).optional(),
  color: hex.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.uuid().optional(),
});

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type UpdateGarmentInput = z.infer<typeof updateGarmentSchema>;
export type ListGarmentsQuery = z.infer<typeof listGarmentsSchema>;
