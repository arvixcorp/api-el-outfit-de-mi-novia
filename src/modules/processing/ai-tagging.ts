import { aiChat, tokenBudget } from "../../lib/ai.js";
import { AppError } from "../../common/errors/AppError.js";
import { logger } from "../../config/logger.js";
import { CATEGORIAS, OCASIONES, PATRONES, TEMPORADAS } from "../garments/garments.schemas.js";
import { parseTagging, type Tagging } from "./tagging.schema.js";

const SYSTEM = `Eres una estilista experta que cataloga prendas de un armario personal a partir de una foto.
Responde SOLO con un objeto JSON, sin texto adicional ni markdown, con exactamente estas claves:
{
  "categoria": uno de ${JSON.stringify(CATEGORIAS)},
  "subcategoria": string en español, p. ej. "camisa", "jean", "falda midi", "botines",
  "colores": [{"nombre": string en español, "hex": "#RRGGBB"}] (de 1 a 4, el principal primero),
  "patron": uno de ${JSON.stringify(PATRONES)},
  "material": string en español (si no se distingue, tu mejor estimación, p. ej. "algodón"),
  "formalidad": entero de 1 (muy informal) a 5 (muy formal),
  "temporadas": subconjunto de ${JSON.stringify(TEMPORADAS)},
  "ocasiones": subconjunto de ${JSON.stringify(OCASIONES)},
  "descripcion": una frase corta en español describiendo la prenda
}
Etiqueta solo la prenda principal de la imagen. Usa exactamente los valores permitidos.`;

/** Etiqueta la prenda con el modelo multimodal. Reintenta una vez si el JSON no valida. */
export async function tagGarment(jpeg: Buffer): Promise<Tagging> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await aiChat({
        system: SYSTEM,
        image: jpeg,
        maxTokens: tokenBudget(1024),
        text:
          attempt === 0
            ? "Etiqueta esta prenda. Responde en JSON."
            : `Etiqueta esta prenda. Tu respuesta anterior no cumplió el formato (${String(lastError).slice(0, 300)}). Responde solo con el JSON pedido.`,
      });
      return parseTagging(reply);
    } catch (err) {
      // Errores de configuración, saldo o red no mejoran reintentando en el mismo momento.
      if (err instanceof AppError) throw err;
      lastError = err;
      logger.warn(`Etiquetado IA inválido (intento ${attempt + 1}): ${String(err).slice(0, 200)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Etiquetado IA inválido");
}
