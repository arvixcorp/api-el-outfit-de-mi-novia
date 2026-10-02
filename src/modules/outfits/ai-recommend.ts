import { aiChat, tokenBudget } from "../../lib/ai.js";
import { logger } from "../../config/logger.js";
import { colorName } from "./color.js";
import { parseAiOutfits } from "./ai-schema.js";
import type { Candidate, RGarment } from "./rules.js";

export interface PromptInput {
  pool: RGarment[];
  candidates: Candidate[];
  ocasion?: string | undefined;
  clima?: { temperaturaC?: number | undefined; lluvia?: boolean | undefined; descripcion?: string | undefined } | undefined;
  estilo?: string | undefined;
  estiloPreferido?: string | null | undefined;
  requeridas: string[];
  meGustaron: string[];
  noMeGustaron: string[];
}

const SYSTEM = `Eres una estilista personal. Te doy el armario de una persona (solo metadatos) y combinaciones candidatas ya filtradas por reglas.
Elige las 3 mejores combinaciones (o menos si no hay 3 buenas) para la situación indicada.
Criterios: teoría del color (neutros + un acento, análogos o complementarios), proporciones (volumen arriba/abajo), formalidad coherente con la ocasión, clima, y el gusto de la persona según lo que le gustó y no le gustó antes. Prefiere variedad entre las 3 opciones.
Usa SOLO ids de prendas que aparecen en "prendas". Cada outfit debe ser un vestido, o un top y un bottom, más opcionalmente calzado, abrigo, bolso y accesorios.
Responde SOLO con JSON, sin texto adicional ni markdown:
{"outfits":[{"prendas":["id","id",...],"nombre":"nombre corto y evocador","explicacion":"2-3 frases en español, cercanas, sobre color, proporciones y ocasión"}]}`;

export function describeGarment(g: RGarment): Record<string, unknown> {
  return {
    id: g.id,
    categoria: g.categoria,
    tipo: g.subcategoria,
    color: colorName(g.colorHex),
    patron: g.patron,
    material: g.material,
    formalidad: g.formalidad,
    favorita: g.favorito || undefined,
  };
}

export function buildUserMessage(input: PromptInput): string {
  const usadas = new Set(input.candidates.flatMap((c) => c.ids));
  const prendas = input.pool.filter((g) => usadas.has(g.id) || input.requeridas.includes(g.id)).map(describeGarment);

  return JSON.stringify({
    situacion: {
      ocasion: input.ocasion ?? "sin especificar",
      clima: input.clima ?? "sin especificar",
      estilo_o_mood: input.estilo ?? null,
      estilo_preferido_de_la_persona: input.estiloPreferido ?? null,
      prendas_obligatorias: input.requeridas,
    },
    prendas,
    candidatas: input.candidates.map((c) => c.ids),
    outfits_que_le_gustaron: input.meGustaron,
    outfits_que_no_le_gustaron: input.noMeGustaron,
  });
}

/** Etapa 2: el modelo elige entre las candidatas (solo metadatos, sin imagenes). */
export async function pickOutfitsWithAi(input: PromptInput) {
  const reply = await aiChat({ system: SYSTEM, text: buildUserMessage(input), maxTokens: tokenBudget(2048) });
  const parsed = parseAiOutfits(reply);
  logger.debug(`IA propuso ${parsed.outfits.length} outfits`);
  return parsed;
}
