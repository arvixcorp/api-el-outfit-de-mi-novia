import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../common/errors/AppError.js";

/**
 * Capa única de IA. Todo el backend (etiquetado de prendas con imagen y recomendación de
 * outfits) pasa por `aiChat`, así que cambiar de proveedor es solo configuración.
 */

export interface AiChatInput {
  system: string;
  text: string;
  /** Imagen opcional (JPEG) para modelos multimodales. */
  image?: Buffer;
  maxTokens: number;
}

export const DEFAULT_MODELS = {
  deepseek: "deepseek-flash",
  anthropic: "claude-sonnet-5-5",
} as const;

let warnedMismatch = false;

export function aiModel(): string {
  const fallback = DEFAULT_MODELS[env.AI_PROVIDER];
  const configured = env.AI_MODEL;
  if (!configured) return fallback;

  // Un AI_MODEL heredado de otro proveedor (p. ej. "claude-..." con DeepSeek) fallaría en cada llamada.
  const isClaude = configured.startsWith("claude-");
  if ((env.AI_PROVIDER === "deepseek" && isClaude) || (env.AI_PROVIDER === "anthropic" && !isClaude)) {
    if (!warnedMismatch) {
      logger.warn(`AI_MODEL=${configured} no corresponde a AI_PROVIDER=${env.AI_PROVIDER}; se usa ${fallback}`);
      warnedMismatch = true;
    }
    return fallback;
  }
  return configured;
}

/** Con razonamiento activado los tokens de pensamiento cuentan dentro de max_tokens. */
export const tokenBudget = (base: number): number => (env.AI_THINKING ? base + 16_000 : base);

export function isAiConfigured(): boolean {
  return env.AI_PROVIDER === "deepseek" ? !!env.DEEPSEEK_API_KEY : !!env.ANTHROPIC_API_KEY;
}

function assertConfigured() {
  if (!isAiConfigured()) {
    const key = env.AI_PROVIDER === "deepseek" ? "DEEPSEEK_API_KEY" : "ANTHROPIC_API_KEY";
    throw new AppError(`${key} no está configurada`, 503, "AI_NOT_CONFIGURED");
  }
}

/** Envía un mensaje al modelo y devuelve su respuesta de texto (se espera un JSON). */
export async function aiChat(input: AiChatInput): Promise<string> {
  assertConfigured();
  return env.AI_PROVIDER === "deepseek" ? deepseekChat(input) : anthropicChat(input);
}

// ---------------------------------------------------------------- DeepSeek

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [1000, 3000, 8000];

interface DeepseekResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string };
}

export function buildDeepseekBody(input: AiChatInput) {
  const userContent = input.image
    ? [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${input.image.toString("base64")}` } },
        { type: "text", text: input.text },
      ]
    : input.text;

  return {
    model: aiModel(),
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: userContent },
    ],
    // Modo JSON: el prompt ya pide JSON explícitamente (requisito de la API).
    response_format: { type: "json_object" },
    max_tokens: input.maxTokens,
    thinking: { type: env.AI_THINKING ? "enabled" : "disabled" },
    stream: false,
  };
}

async function deepseekChat(input: AiChatInput): Promise<string> {
  const url = `${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`;
  const body = JSON.stringify(buildDeepseekBody(input));

  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new AppError(`No se pudo contactar a DeepSeek: ${String(err)}`, 502, "AI_UNREACHABLE");
      }
    }

    if (res) {
      if (res.ok) {
        const json = (await res.json()) as DeepseekResponse;
        const choice = json.choices?.[0];
        if (choice?.finish_reason === "length") throw new AppError("La respuesta de la IA se cortó", 502, "AI_TRUNCATED");
        if (choice?.finish_reason === "content_filter") throw new AppError("La IA rechazó la solicitud", 502, "AI_REFUSAL");
        const content = choice?.message?.content;
        if (!content) throw new AppError("La IA devolvió una respuesta vacía", 502, "AI_EMPTY");
        return content;
      }

      const detail = ((await res.json().catch(() => null)) as DeepseekResponse | null)?.error?.message ?? res.statusText;
      if (res.status === 401) throw new AppError("DEEPSEEK_API_KEY inválida", 503, "AI_BAD_KEY");
      if (res.status === 402) throw new AppError("Saldo insuficiente en DeepSeek", 503, "AI_NO_BALANCE");
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
        throw new AppError(`DeepSeek respondió ${res.status}: ${detail}`, 502, "AI_REQUEST_FAILED");
      }
    }

    logger.warn(`DeepSeek: reintento ${attempt + 1}/${RETRY_DELAYS_MS.length}`);
    await sleep(RETRY_DELAYS_MS[attempt]!);
  }
}

// --------------------------------------------------------------- Anthropic

let anthropic: Anthropic | undefined;

async function anthropicChat(input: AiChatInput): Promise<string> {
  anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, maxRetries: 3 });
  const message = await anthropic.messages.create({
    model: aiModel(),
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [
      {
        role: "user",
        content: [
          ...(input.image
            ? [{ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: input.image.toString("base64") } }]
            : []),
          { type: "text" as const, text: input.text },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") throw new AppError("El modelo rechazó la solicitud", 502, "AI_REFUSAL");
  if (message.stop_reason === "max_tokens") throw new AppError("La respuesta de la IA se cortó", 502, "AI_TRUNCATED");
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
