import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/AppError.js";

const TIMEOUT_MS = 120_000;

interface PostOptions {
  url: string;
  field: string;
  image: Buffer;
  headers?: Record<string, string>;
  /** Campos extra del formulario multipart. */
  form?: Record<string, string>;
}

async function postImage({ url, field, image, headers = {}, form: extra = {} }: PostOptions) {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "image.jpg");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);

  const res = await fetch(url, {
    method: "POST",
    body: form,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new AppError(`El servicio de quitar fondo respondió ${res.status} ${detail}`, 502, "BG_REMOVAL_FAILED");
  }
  return Buffer.from(await res.arrayBuffer());
}

/** "format=PNG&type=product" -> { format: "PNG", type: "product" } */
export function parseExtraForm(raw: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(raw.replace(/^\?/, "")).entries());
}

/**
 * Devuelve la imagen sin fondo (con transparencia).
 * - rembg (autohospedado): POST {REMBG_URL}/api/remove, campo "file".
 * - external: POST BG_REMOVAL_EXTERNAL_URL con la clave en BG_REMOVAL_EXTERNAL_KEY_HEADER, la imagen en
 *   BG_REMOVAL_EXTERNAL_FIELD y los campos extra de BG_REMOVAL_EXTERNAL_FORM. La respuesta debe ser la
 *   imagen binaria (PNG o WebP con alpha).
 */
export async function removeBackground(image: Buffer): Promise<Buffer> {
  if (env.BG_REMOVAL_PROVIDER === "external") {
    if (!env.BG_REMOVAL_EXTERNAL_URL) {
      throw new AppError("BG_REMOVAL_EXTERNAL_URL no está configurada", 503, "BG_REMOVAL_NOT_CONFIGURED");
    }
    return postImage({
      url: env.BG_REMOVAL_EXTERNAL_URL,
      field: env.BG_REMOVAL_EXTERNAL_FIELD,
      image,
      headers: env.BG_REMOVAL_EXTERNAL_API_KEY ? { [env.BG_REMOVAL_EXTERNAL_KEY_HEADER]: env.BG_REMOVAL_EXTERNAL_API_KEY } : {},
      form: parseExtraForm(env.BG_REMOVAL_EXTERNAL_FORM),
    });
  }
  return postImage({ url: `${env.REMBG_URL.replace(/\/$/, "")}/api/remove`, field: "file", image });
}
