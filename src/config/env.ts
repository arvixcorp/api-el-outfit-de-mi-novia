import "dotenv/config";
import { z } from "zod";
import { resolveDatabaseUrl } from "./database-url.js";

const boolFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default("*"),

  DATABASE_URL: z
    .string({ error: "Define DATABASE_URL o MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD y MYSQL_DATABASENAME" })
    .min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET debe tener al menos 32 caracteres"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET es obligatoria"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolFromString.default(false),
  S3_PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  BG_REMOVAL_PROVIDER: z.enum(["rembg", "external"]).default("rembg"),
  REMBG_URL: z.string().default("http://localhost:7000"),
  BG_REMOVAL_EXTERNAL_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  BG_REMOVAL_EXTERNAL_API_KEY: z.string().optional(),
  /** Nombre del header con la clave (remove.bg y rembg.com usan x-api-key). */
  BG_REMOVAL_EXTERNAL_KEY_HEADER: z.string().default("x-api-key"),
  /** Nombre del campo multipart con la imagen (remove.bg: image_file, rembg.com: image). */
  BG_REMOVAL_EXTERNAL_FIELD: z.string().default("image_file"),
  /** Campos extra del formulario, estilo query string: "format=PNG&type=product". */
  BG_REMOVAL_EXTERNAL_FORM: z.string().default(""),

  // IA: un solo proveedor para etiquetar prendas (con imagen) y recomendar outfits.
  AI_PROVIDER: z.enum(["deepseek", "anthropic"]).default("deepseek"),
  /** Si se omite se usa el modelo por defecto del proveedor (ver lib/ai.ts). */
  AI_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(30),
  /** Razonamiento del modelo: más lento y caro, no hace falta para etiquetar ni elegir outfits. */
  AI_THINKING: boolFromString.default(false),
  DEEPSEEK_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

  // Worker de procesamiento de imagenes (corre dentro de la API)
  WORKER_ENABLED: boolFromString.default(true),
  WORKER_POLL_MS: z.coerce.number().int().min(500).default(3000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse({
    ...source,
    DATABASE_URL: resolveDatabaseUrl(source),
  });
  if (!result.success) {
    const detalle = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${detalle}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
