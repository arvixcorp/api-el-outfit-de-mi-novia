import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropAndCenter, makeBlurhash, makeThumbnail, normalizeOriginal, opaqueBounds, toRgba } from "../src/modules/processing/image.js";
import { extractColors, extractColorsFromRgba } from "../src/modules/processing/colors.js";
import { extractJson, parseTagging } from "../src/modules/processing/tagging.schema.js";
import { backoffMs } from "../src/modules/processing/worker.js";

/** PNG transparente 200x200 con un rectángulo opaco del color dado en (x,y,w,h). */
async function cutout(color: { r: number; g: number; b: number }, rect = { x: 50, y: 80, w: 60, h: 40 }) {
  const box = await sharp({ create: { width: rect.w, height: rect.h, channels: 4, background: { ...color, alpha: 1 } } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: box, left: rect.x, top: rect.y }])
    .png()
    .toBuffer();
}

describe("recorte y centrado", () => {
  it("encuentra la caja del contenido opaco", async () => {
    const box = opaqueBounds(await toRgba(await cutout({ r: 200, g: 30, b: 30 })));
    expect(box).toEqual({ left: 50, top: 80, width: 60, height: 40 });
  });

  it("recorta al contenido y agrega padding uniforme", async () => {
    const out = await cropAndCenter(await cutout({ r: 200, g: 30, b: 30 }), { paddingRatio: 0.1 });
    // contenido 60x40 + padding de 6px por lado
    expect(out.width).toBe(72);
    expect(out.height).toBe(52);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it("falla si todo es transparente", async () => {
    const empty = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    await expect(cropAndCenter(empty)).rejects.toThrow(/vacía/);
  });
});

describe("normalizeOriginal", () => {
  it("limita el lado largo a 2048 y devuelve JPEG", async () => {
    const big = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#888" } }).jpeg().toBuffer();
    const meta = await sharp(await normalizeOriginal(big)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(2048);
  });
});

describe("thumbnail y blurhash", () => {
  it("genera WebP acotado y un blurhash", async () => {
    const png = await cutout({ r: 20, g: 60, b: 200 });
    const meta = await sharp(await makeThumbnail(png, 100)).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(100);
    expect(await makeBlurhash(png)).toMatch(/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,}$/);
  });
});

describe("colores", () => {
  it("el dominante es el color de la prenda, ignorando la transparencia", async () => {
    const colors = await extractColors(await cutout({ r: 200, g: 30, b: 30 }));
    expect(colors?.dominante).toMatch(/^#[0-9a-f]{6}$/);
    const hex = colors!.dominante;
    expect(parseInt(hex.slice(1, 3), 16)).toBeGreaterThan(180);
    expect(parseInt(hex.slice(3, 5), 16)).toBeLessThan(60);
  });

  it("separa colores distintos en secundarios", () => {
    const width = 4;
    const height = 2;
    const data = Buffer.alloc(width * height * 4);
    const paint = (i: number, r: number, g: number, b: number) => data.set([r, g, b, 255], i * 4);
    for (let i = 0; i < 6; i++) paint(i, 250, 250, 250); // blanco (dominante)
    paint(6, 10, 10, 10); // negro
    paint(7, 10, 10, 10);
    const res = extractColorsFromRgba({ data, width, height });
    expect(res?.dominante).toBe("#fafafa");
    expect(res?.secundarios).toEqual(["#0a0a0a"]);
  });

  it("devuelve null si no hay pixeles opacos", () => {
    expect(extractColorsFromRgba({ data: Buffer.alloc(16), width: 2, height: 2 })).toBeNull();
  });
});

describe("validación de la respuesta de la IA", () => {
  const valid = {
    categoria: "top",
    subcategoria: "camisa",
    colores: [{ nombre: "blanco", hex: "#FFFFFF" }],
    patron: "liso",
    material: "algodón",
    formalidad: 3,
    temporadas: ["primavera", "verano"],
    ocasiones: ["casual", "trabajo"],
    descripcion: "Camisa blanca de algodón",
  };

  it("acepta JSON válido, también dentro de un bloque ```json", () => {
    expect(parseTagging(JSON.stringify(valid)).categoria).toBe("top");
    expect(parseTagging("Aquí va:\n```json\n" + JSON.stringify(valid) + "\n```").subcategoria).toBe("camisa");
  });

  it("rechaza categorías, formalidad y hex inválidos", () => {
    expect(() => parseTagging(JSON.stringify({ ...valid, categoria: "sombrero" }))).toThrow();
    expect(() => parseTagging(JSON.stringify({ ...valid, formalidad: 9 }))).toThrow();
    expect(() => parseTagging(JSON.stringify({ ...valid, colores: [{ nombre: "x", hex: "blanco" }] }))).toThrow();
  });

  it("rechaza texto sin JSON", () => {
    expect(() => extractJson("no sé")).toThrow();
  });
});

describe("worker", () => {
  it("el backoff crece por intento", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(480_000);
  });
});
