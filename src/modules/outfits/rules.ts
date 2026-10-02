import { colorHarmonyScore } from "./color.js";

export type Categoria = "top" | "bottom" | "vestido" | "outerwear" | "calzado" | "bolso" | "accesorio";
export type Ocasion = "casual" | "trabajo" | "cita" | "fiesta" | "deporte" | "viaje";

export interface RGarment {
  id: string;
  categoria: Categoria;
  subcategoria: string | null;
  colorHex: string | null;
  patron: string | null;
  material: string | null;
  formalidad: number | null;
  temporadas: string[];
  ocasiones: string[];
  favorito: boolean;
  ultimaVezUsada: Date | null;
}

export interface RuleContext {
  ocasion?: Ocasion | undefined;
  temperaturaC?: number | undefined;
  lluvia?: boolean | undefined;
  /** Prendas que el outfit debe incluir ("quiero usar esta falda", "completa mi outfit"). */
  requeridas?: string[] | undefined;
  /** Prendas usadas hace poco (wear_log): se evitan salvo que sean obligatorias. */
  recientes?: ReadonlySet<string> | undefined;
  now?: Date | undefined;
}

export interface Candidate {
  ids: string[];
  garments: RGarment[];
  score: number;
}

export const FORMALIDAD_POR_OCASION: Record<Ocasion, [number, number]> = {
  casual: [1, 3],
  trabajo: [3, 5],
  cita: [3, 5],
  fiesta: [3, 5],
  deporte: [1, 2],
  viaje: [1, 3],
};

/** Posicion visual (0 = al fondo) para el "flat lay" por capas. */
export const CAPA_POR_CATEGORIA: Record<Categoria, number> = {
  outerwear: 0,
  top: 1,
  vestido: 1,
  bottom: 2,
  calzado: 3,
  bolso: 4,
  accesorio: 5,
};

const MAX_POR_CATEGORIA = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

export function temporadasParaTemperatura(t: number): string[] {
  if (t <= 10) return ["invierno"];
  if (t <= 17) return ["otoño", "primavera", "invierno"];
  if (t <= 24) return ["primavera", "verano", "otoño"];
  return ["verano", "primavera"];
}

export function necesitaAbrigo(ctx: RuleContext): boolean {
  return (ctx.temperaturaC !== undefined && ctx.temperaturaC < 16) || ctx.lluvia === true;
}

/** Etapa 1a: descarta prendas por clima/temporada, formalidad y uso reciente. */
export function filterGarments(garments: RGarment[], ctx: RuleContext): RGarment[] {
  const required = new Set(ctx.requeridas ?? []);
  const seasons = ctx.temperaturaC !== undefined ? temporadasParaTemperatura(ctx.temperaturaC) : null;
  const range = ctx.ocasion ? FORMALIDAD_POR_OCASION[ctx.ocasion] : null;

  const passesBase = (g: RGarment) => {
    if (required.has(g.id)) return true;
    if (seasons && g.temporadas.length > 0 && !g.temporadas.some((s) => seasons.includes(s))) return false;
    if (range && g.formalidad !== null && (g.formalidad < range[0] || g.formalidad > range[1])) return false;
    return true;
  };

  const base = garments.filter(passesBase);
  const recientes = ctx.recientes;
  if (!recientes || recientes.size === 0) return base;

  // Evita lo usado recientemente, pero nunca deja una categoria vacia por eso.
  const fresh = base.filter((g) => required.has(g.id) || !recientes.has(g.id));
  const categoriasFresh = new Set(fresh.map((g) => g.categoria));
  const rescued = base.filter((g) => !fresh.includes(g) && !categoriasFresh.has(g.categoria));
  return [...fresh, ...rescued];
}

/** Un outfit valido: vestido o top+bottom, como mucho una prenda por categoria (2 accesorios). */
export function isValidCombo(garments: RGarment[]): boolean {
  const count = (c: Categoria) => garments.filter((g) => g.categoria === c).length;
  const vestido = count("vestido");
  const top = count("top");
  const bottom = count("bottom");
  const hasBase = vestido === 1 ? top === 0 && bottom === 0 : vestido === 0 && top === 1 && bottom === 1;
  if (!hasBase) return false;
  return count("outerwear") <= 1 && count("calzado") <= 1 && count("bolso") <= 1 && count("accesorio") <= 2;
}

function individualScore(g: RGarment, ctx: RuleContext, now: number): number {
  let s = g.favorito ? 0.3 : 0;
  if (ctx.ocasion && g.ocasiones.includes(ctx.ocasion)) s += 0.5;
  if (g.ultimaVezUsada) {
    const dias = (now - g.ultimaVezUsada.getTime()) / DAY_MS;
    if (dias < 3) s -= 1.5;
    else if (dias < 7) s -= 0.7;
  }
  return s;
}

function comboScore(garments: RGarment[], ctx: RuleContext, now: number): number {
  let score = colorHarmonyScore(garments.map((g) => g.colorHex));

  const conPatron = garments.filter((g) => g.patron && g.patron !== "liso").length;
  if (conPatron > 1) score -= 2 * (conPatron - 1);

  const formalidades = garments.map((g) => g.formalidad).filter((f): f is number => f !== null);
  if (formalidades.length > 1) score -= (Math.max(...formalidades) - Math.min(...formalidades)) * 0.8;

  for (const g of garments) score += individualScore(g, ctx, now);
  if (ctx.recientes) for (const g of garments) if (ctx.recientes.has(g.id)) score -= 3;
  return score;
}

/** Mejores N prendas de una categoria, forzando a incluir las obligatorias. */
function topOf(pool: RGarment[], ctx: RuleContext, now: number, required: Set<string>): RGarment[] {
  const sorted = [...pool].sort(
    (a, b) => individualScore(b, ctx, now) - individualScore(a, ctx, now) || a.id.localeCompare(b.id),
  );
  const head = sorted.slice(0, MAX_POR_CATEGORIA);
  for (const g of pool) if (required.has(g.id) && !head.includes(g)) head.push(g);
  return head;
}

/**
 * Etapa 1b: arma combinaciones validas (vestido o top+bottom, + calzado, + abrigo si hace
 * frio/llueve, + accesorios opcionales) y devuelve las mejores segun reglas de color,
 * patron, formalidad, uso reciente y favoritos.
 */
export function buildCandidates(pool: RGarment[], ctx: RuleContext, limit = 25): Candidate[] {
  const now = (ctx.now ?? new Date()).getTime();
  const required = new Set(ctx.requeridas ?? []);
  const by = (c: Categoria) => pool.filter((g) => g.categoria === c);

  const tops = topOf(by("top"), ctx, now, required);
  const bottoms = topOf(by("bottom"), ctx, now, required);
  const vestidos = topOf(by("vestido"), ctx, now, required);
  const calzados = topOf(by("calzado"), ctx, now, required).slice(0, 3 + required.size);
  const abrigos = topOf(by("outerwear"), ctx, now, required).slice(0, 2 + required.size);
  const bolsos = topOf(by("bolso"), ctx, now, required);
  const accesorios = topOf(by("accesorio"), ctx, now, required);

  const bases: RGarment[][] = [
    ...vestidos.map((v) => [v]),
    ...tops.flatMap((t) => bottoms.map((b) => [t, b])),
  ];
  const abrigoNecesario = necesitaAbrigo(ctx) && abrigos.length > 0;
  const abrigoOpciones: (RGarment | null)[] = abrigoNecesario ? abrigos : [null];
  const calzadoOpciones: (RGarment | null)[] = calzados.length ? calzados : [null];

  const out: Candidate[] = [];
  for (const base of bases) {
    for (const calzado of calzadoOpciones) {
      for (const abrigo of abrigoOpciones) {
        const core = [...base, ...(calzado ? [calzado] : []), ...(abrigo ? [abrigo] : [])];

        // Extras: el bolso y el accesorio que mejor armonizan, si existen.
        const withBest = (list: RGarment[]) =>
          list.length
            ? [...list].sort(
                (a, b) =>
                  comboScore([...core, b], ctx, now) - comboScore([...core, a], ctx, now) || a.id.localeCompare(b.id),
              )[0]
            : undefined;
        const bolso = withBest(bolsos);
        const garments = [...core, ...(bolso ? [bolso] : [])];
        const accesorio = withBest(accesorios);
        if (accesorio) garments.push(accesorio);

        // Los extras no obligatorios solo se quedan si no empeoran la armonia.
        const final = comboScore(garments, ctx, now) >= comboScore(core, ctx, now) - 0.5 ? garments : core;

        if (!isValidCombo(final)) continue;
        if (![...required].every((id) => final.some((g) => g.id === id))) continue;
        out.push({ ids: final.map((g) => g.id), garments: final, score: comboScore(final, ctx, now) });
      }
    }
  }

  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score || a.ids.join().localeCompare(b.ids.join()))
    .filter((c) => {
      const key = [...c.ids].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
