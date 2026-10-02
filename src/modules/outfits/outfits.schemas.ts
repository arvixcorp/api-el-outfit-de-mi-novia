import { z } from "zod";

export const OCASIONES_OUTFIT = ["casual", "trabajo", "cita", "fiesta", "deporte", "viaje"] as const;

export const recommendSchema = z.object({
  ocasion: z.enum(OCASIONES_OUTFIT).optional(),
  /** Si se omite y la usuaria tiene ciudad, se consulta el clima automáticamente. */
  temperaturaC: z.number().min(-30).max(55).optional(),
  lluvia: z.boolean().optional(),
  estilo: z.string().trim().max(300).optional(),
  prendaObligatoria: z.uuid().optional(),
  /** Ignora la caché y vuelve a pedir a la IA. */
  forzar: z.boolean().optional(),
});

export const completeSchema = z.object({
  prendas: z.array(z.uuid()).min(1).max(2),
  ocasion: z.enum(OCASIONES_OUTFIT).optional(),
  temperaturaC: z.number().min(-30).max(55).optional(),
  lluvia: z.boolean().optional(),
  estilo: z.string().trim().max(300).optional(),
  forzar: z.boolean().optional(),
});

const itemSchema = z.object({
  garmentId: z.uuid(),
  posicion: z.number().int().min(0).max(20),
  layout: z
    .object({
      x: z.number().min(-0.2).max(1.2),
      y: z.number().min(-0.2).max(1.2),
      s: z.number().min(0.2).max(3),
    })
    .nullable()
    .optional(),
});

export const createOutfitSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  ocasion: z.enum(OCASIONES_OUTFIT).optional(),
  items: z.array(itemSchema).min(1).max(12),
});

export const updateOutfitSchema = z
  .object({
    nombre: z.string().trim().min(1).max(80).nullable(),
    ocasion: z.enum(OCASIONES_OUTFIT).nullable(),
    favorito: z.boolean(),
    guardado: z.boolean(),
    items: z.array(itemSchema).min(1).max(12),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No hay campos para actualizar");

export const feedbackSchema = z.object({
  rating: z.enum(["me_gusta", "no_me_gusta"]),
  comentario: z.string().trim().max(500).optional(),
});

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");

export const wearSchema = z.object({ fecha: fecha.optional() });

export const listOutfitsSchema = z.object({
  guardado: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  favorito: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  origen: z.enum(["ia", "manual"]).optional(),
  garmentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.uuid().optional(),
});

export const wearLogQuerySchema = z.object({ desde: fecha, hasta: fecha });

export type RecommendInput = z.infer<typeof recommendSchema>;
export type CompleteInput = z.infer<typeof completeSchema>;
export type CreateOutfitInput = z.infer<typeof createOutfitSchema>;
export type UpdateOutfitInput = z.infer<typeof updateOutfitSchema>;
export type ListOutfitsQuery = z.infer<typeof listOutfitsSchema>;
