import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(128),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  estiloPreferido: z.string().trim().max(500).optional(),
  ciudad: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken es obligatorio"),
});

export const updateProfileSchema = z
  .object({
    nombre: z.string().trim().min(1).max(100),
    estiloPreferido: z.string().trim().max(500).nullable(),
    ciudad: z.string().trim().max(100).nullable(),
  })
  .partial();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
