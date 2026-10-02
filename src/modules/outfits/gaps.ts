import { isNeutral } from "./color.js";
import type { Categoria, RGarment } from "./rules.js";

export interface Gap {
  id: string;
  severidad: "alta" | "media" | "baja";
  mensaje: string;
}

const NOMBRES: Record<"top" | "bottom" | "calzado" | "outerwear", string> = {
  top: "tops (camisas, blusas, camisetas)",
  bottom: "bottoms (pantalones, faldas)",
  calzado: "calzado",
  outerwear: "prendas de abrigo (chaquetas, abrigos)",
};

/** Detecta huecos del armario con reglas simples (sin IA, sin costo). */
export function analyzeGaps(garments: RGarment[]): Gap[] {
  const gaps: Gap[] = [];
  if (garments.length === 0) return gaps;

  const of = (c: Categoria) => garments.filter((g) => g.categoria === c);
  const tops = of("top");
  const bottoms = of("bottom");
  const calzado = of("calzado");

  for (const c of ["top", "bottom", "calzado"] as const) {
    if (of(c).length === 0 && garments.length >= 3) {
      gaps.push({
        id: `sin-${c}`,
        severidad: "alta",
        mensaje: `Aún no tienes ${NOMBRES[c]}: sin eso no puedo armar outfits completos.`,
      });
    }
  }

  if (calzado.length > 0 && !calzado.some((g) => (g.formalidad ?? 0) >= 4)) {
    gaps.push({
      id: "sin-calzado-formal",
      severidad: "media",
      mensaje: "No tienes ningún calzado formal para trabajo, citas o eventos.",
    });
  }
  if (calzado.length > 0 && !calzado.some((g) => g.formalidad !== null && g.formalidad <= 2)) {
    gaps.push({
      id: "sin-calzado-casual",
      severidad: "baja",
      mensaje: "Te falta un calzado cómodo o deportivo para el día a día.",
    });
  }

  if (tops.length >= 4) {
    const neutros = tops.filter((g) => isNeutral(g.colorHex)).length;
    if (neutros / tops.length >= 0.75) {
      gaps.push({
        id: "tops-neutros",
        severidad: "media",
        mensaje: `Tienes muchos tops neutros (${neutros} de ${tops.length}) y casi ninguno con color o estampado.`,
      });
    }
  }

  if (bottoms.length > 0 && tops.length > bottoms.length * 2.5) {
    gaps.push({
      id: "pocos-bottoms",
      severidad: "media",
      mensaje: `Tienes ${tops.length} tops pero solo ${bottoms.length} bottoms: se repetirán mucho.`,
    });
  }

  if (garments.length >= 8 && of("outerwear").length === 0) {
    gaps.push({
      id: "sin-outerwear",
      severidad: "media",
      mensaje: "No tienes prendas de abrigo para días fríos o lluviosos.",
    });
  }

  if (garments.length >= 8 && !garments.some((g) => (g.formalidad ?? 0) >= 4)) {
    gaps.push({
      id: "sin-formal",
      severidad: "baja",
      mensaje: "No tienes prendas formales (formalidad 4-5) para trabajo o eventos.",
    });
  }

  if (garments.length >= 10) {
    for (const temporada of ["verano", "invierno"] as const) {
      const n = garments.filter((g) => g.temporadas.includes(temporada)).length;
      if (n < 3) {
        gaps.push({
          id: `pocas-${temporada}`,
          severidad: "baja",
          mensaje: `Tienes pocas prendas pensadas para ${temporada} (${n}).`,
        });
      }
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 } as const;
  return gaps.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
