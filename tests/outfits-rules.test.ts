import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  filterGarments,
  isValidCombo,
  necesitaAbrigo,
  temporadasParaTemperatura,
  type Categoria,
  type RGarment,
} from "../src/modules/outfits/rules.js";
import { colorHarmonyScore, colorName, isNeutral } from "../src/modules/outfits/color.js";
import { analyzeGaps } from "../src/modules/outfits/gaps.js";
import {
  fallbackFromCandidates,
  parseAiOutfits,
  validateAiOutfits,
} from "../src/modules/outfits/ai-schema.js";
import { buildUserMessage } from "../src/modules/outfits/ai-recommend.js";

let n = 0;
function g(categoria: Categoria, over: Partial<RGarment> = {}): RGarment {
  n++;
  return {
    id: `g${n}-${categoria}`,
    categoria,
    subcategoria: categoria,
    colorHex: "#111111",
    patron: "liso",
    material: null,
    formalidad: 2,
    temporadas: [],
    ocasiones: [],
    favorito: false,
    ultimaVezUsada: null,
    ...over,
  };
}

describe("color", () => {
  it("reconoce neutros y tonos fuertes", () => {
    expect(isNeutral("#000000")).toBe(true);
    expect(isNeutral("#f5f0e8")).toBe(true);
    expect(isNeutral("#d41f1f")).toBe(false);
    expect(isNeutral(null)).toBe(true);
  });

  it("neutros + un acento arman bien; tres tonos fuertes no", () => {
    expect(colorHarmonyScore(["#000000", "#ffffff", "#d41f1f"])).toBeGreaterThan(0);
    expect(colorHarmonyScore(["#d41f1f", "#1fd41f", "#1f1fd4"])).toBeLessThan(0);
  });

  it("da nombres en español", () => {
    expect(colorName("#000000")).toBe("negro");
    expect(colorName("#ffffff")).toBe("blanco");
    expect(colorName("#d41f1f")).toBe("rojo");
  });
});

describe("filterGarments (etapa 1 por reglas)", () => {
  it("descarta prendas de otra temporada según la temperatura", () => {
    const abrigo = g("outerwear", { temporadas: ["invierno"] });
    const camiseta = g("top", { temporadas: ["verano"] });
    const sinTemporada = g("bottom");
    const frio = filterGarments([abrigo, camiseta, sinTemporada], { temperaturaC: 5 });
    expect(frio.map((x) => x.id)).toEqual([abrigo.id, sinTemporada.id]);
    const calor = filterGarments([abrigo, camiseta, sinTemporada], { temperaturaC: 30 });
    expect(calor.map((x) => x.id)).toEqual([camiseta.id, sinTemporada.id]);
  });

  it("descarta formalidad incompatible con la ocasión", () => {
    const traje = g("top", { formalidad: 5 });
    const chandal = g("bottom", { formalidad: 1 });
    expect(filterGarments([traje, chandal], { ocasion: "trabajo" }).map((x) => x.id)).toEqual([traje.id]);
    expect(filterGarments([traje, chandal], { ocasion: "deporte" }).map((x) => x.id)).toEqual([chandal.id]);
  });

  it("nunca descarta las prendas obligatorias", () => {
    const traje = g("top", { formalidad: 5 });
    expect(filterGarments([traje], { ocasion: "deporte", requeridas: [traje.id] })).toHaveLength(1);
  });

  it("evita lo usado recientemente pero no vacía una categoría", () => {
    const a = g("top");
    const b = g("top");
    const zapato = g("calzado");
    const out = filterGarments([a, b, zapato], { recientes: new Set([a.id, zapato.id]) });
    expect(out.map((x) => x.id)).toContain(b.id);
    expect(out.map((x) => x.id)).not.toContain(a.id);
    expect(out.map((x) => x.id)).toContain(zapato.id); // única opción de calzado
  });
});

describe("isValidCombo", () => {
  it("acepta vestido solo o top + bottom", () => {
    expect(isValidCombo([g("vestido"), g("calzado")])).toBe(true);
    expect(isValidCombo([g("top"), g("bottom")])).toBe(true);
  });

  it("rechaza combinaciones imposibles", () => {
    expect(isValidCombo([g("top")])).toBe(false);
    expect(isValidCombo([g("vestido"), g("top")])).toBe(false);
    expect(isValidCombo([g("top"), g("top"), g("bottom")])).toBe(false);
    expect(isValidCombo([g("top"), g("bottom"), g("calzado"), g("calzado")])).toBe(false);
  });
});

describe("buildCandidates", () => {
  const top = g("top");
  const bottom = g("bottom");
  const vestido = g("vestido");
  const calzado = g("calzado");
  const abrigo = g("outerwear");
  const bolso = g("bolso");

  it("arma outfits válidos con vestido o top+bottom y calzado", () => {
    const c = buildCandidates([top, bottom, vestido, calzado], {});
    expect(c.length).toBeGreaterThanOrEqual(2);
    for (const cand of c) {
      expect(isValidCombo(cand.garments)).toBe(true);
      expect(cand.garments.some((x) => x.categoria === "calzado")).toBe(true);
    }
  });

  it("incluye abrigo cuando hace frío o llueve, y no cuando hace calor", () => {
    const frio = buildCandidates([top, bottom, calzado, abrigo], { temperaturaC: 8 });
    expect(frio.every((c) => c.garments.some((x) => x.categoria === "outerwear"))).toBe(true);
    const lluvia = buildCandidates([top, bottom, calzado, abrigo], { temperaturaC: 22, lluvia: true });
    expect(lluvia.every((c) => c.garments.some((x) => x.categoria === "outerwear"))).toBe(true);
    const calor = buildCandidates([top, bottom, calzado, abrigo], { temperaturaC: 28 });
    expect(calor.every((c) => !c.garments.some((x) => x.categoria === "outerwear"))).toBe(true);
    expect(necesitaAbrigo({ temperaturaC: 8 })).toBe(true);
    expect(necesitaAbrigo({ temperaturaC: 28 })).toBe(false);
  });

  it("respeta la prenda obligatoria", () => {
    const falda = g("bottom");
    const otroTop = g("top");
    const c = buildCandidates([top, otroTop, bottom, falda, calzado], { requeridas: [falda.id] });
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x.ids.includes(falda.id))).toBe(true);
  });

  it("'completa mi outfit': con top y bottom elegidos sugiere el resto", () => {
    const c = buildCandidates([top, bottom, calzado, bolso], { requeridas: [top.id, bottom.id] });
    expect(c[0]?.ids).toEqual(expect.arrayContaining([top.id, bottom.id, calzado.id]));
  });

  it("devuelve vacío si las obligatorias no combinan (dos tops)", () => {
    const t2 = g("top");
    expect(buildCandidates([top, t2, bottom, calzado], { requeridas: [top.id, t2.id] })).toEqual([]);
  });

  it("prefiere colores armónicos a tres tonos fuertes", () => {
    const rojo = g("top", { colorHex: "#d41f1f" });
    const verde = g("bottom", { colorHex: "#1fd41f" });
    const negro = g("bottom", { colorHex: "#111111" });
    const zapatoAzul = g("calzado", { colorHex: "#1f1fd4" });
    const c = buildCandidates([rojo, verde, negro, zapatoAzul], {});
    expect(c[0]?.ids).toContain(negro.id);
  });

  it("penaliza lo usado hace poco", () => {
    const fresco = g("top");
    const usado = g("top", { ultimaVezUsada: new Date(Date.now() - 24 * 3600 * 1000) });
    const c = buildCandidates([fresco, usado, bottom, calzado], {});
    expect(c[0]?.ids).toContain(fresco.id);
  });
});

describe("analyzeGaps", () => {
  it("detecta muchos tops neutros y ningún calzado formal", () => {
    const garments = [
      ...Array.from({ length: 5 }, () => g("top", { colorHex: "#111111" })),
      g("bottom"),
      g("bottom"),
      g("calzado", { formalidad: 1 }),
    ];
    const ids = analyzeGaps(garments).map((x) => x.id);
    expect(ids).toContain("tops-neutros");
    expect(ids).toContain("sin-calzado-formal");
  });

  it("marca categorías que faltan por completo", () => {
    const ids = analyzeGaps([g("top"), g("top"), g("bottom")]).map((x) => x.id);
    expect(ids).toContain("sin-calzado");
  });

  it("no inventa huecos en un armario vacío", () => {
    expect(analyzeGaps([])).toEqual([]);
  });
});

describe("validación de la respuesta de la IA", () => {
  const top = g("top");
  const bottom = g("bottom");
  const calzado = g("calzado");
  const pool = [top, bottom, calzado];
  const ok = { prendas: [top.id, bottom.id, calzado.id], nombre: "Casual", explicacion: "Neutros y cómodo." };

  it("acepta una respuesta con ids existentes", () => {
    const parsed = parseAiOutfits(JSON.stringify({ outfits: [ok] }));
    expect(validateAiOutfits(parsed, pool)).toHaveLength(1);
  });

  it("descarta ids inventados, repetidos y combinaciones inválidas", () => {
    const parsed = parseAiOutfits(
      JSON.stringify({
        outfits: [
          { ...ok, prendas: [top.id, "uuid-falso"] },
          { ...ok, prendas: [top.id, top.id, bottom.id] },
          { ...ok, prendas: [top.id, calzado.id] }, // falta bottom
          ok,
          ok, // duplicado
        ],
      }),
    );
    expect(validateAiOutfits(parsed, pool)).toHaveLength(1);
  });

  it("exige las prendas obligatorias", () => {
    const parsed = parseAiOutfits(JSON.stringify({ outfits: [ok] }));
    expect(validateAiOutfits(parsed, pool, ["otra-prenda"])).toHaveLength(0);
    expect(validateAiOutfits(parsed, pool, [top.id])).toHaveLength(1);
  });

  it("rechaza JSON que no cumple el esquema", () => {
    expect(() => parseAiOutfits(JSON.stringify({ outfits: [] }))).toThrow();
    expect(() => parseAiOutfits(JSON.stringify({ outfits: [{ prendas: ["a"], nombre: "x", explicacion: "y" }] }))).toThrow();
    expect(() => parseAiOutfits("sin json")).toThrow();
  });

  it("el fallback usa las mejores candidatas por reglas", () => {
    const cands = buildCandidates(pool, {});
    const fb = fallbackFromCandidates(cands);
    expect(fb.length).toBeGreaterThan(0);
    expect(fb[0]?.ids.length).toBeGreaterThanOrEqual(3);
  });
});

describe("prompt", () => {
  it("solo envía metadatos de las candidatas, sin imágenes ni urls", () => {
    const top = g("top");
    const bottom = g("bottom");
    const calzado = g("calzado");
    const sobrante = g("accesorio");
    const candidates = buildCandidates([top, bottom, calzado], {});
    const msg = buildUserMessage({
      pool: [top, bottom, calzado, sobrante],
      candidates,
      requeridas: [],
      meGustaron: ["camisa blanca + jean azul"],
      noMeGustaron: [],
    });
    const parsed = JSON.parse(msg);
    expect(parsed.prendas.map((p: { id: string }) => p.id)).not.toContain(sobrante.id);
    expect(msg).not.toMatch(/https?:/);
    expect(parsed.outfits_que_le_gustaron).toEqual(["camisa blanca + jean azul"]);
  });
});

describe("temporadas", () => {
  it("mapea temperatura a temporadas", () => {
    expect(temporadasParaTemperatura(5)).toEqual(["invierno"]);
    expect(temporadasParaTemperatura(30)).toContain("verano");
  });
});
