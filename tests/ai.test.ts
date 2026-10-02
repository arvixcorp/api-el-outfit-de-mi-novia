import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El env se evalúa al importar: se fija antes de cargar la capa de IA.
process.env["AI_PROVIDER"] = "deepseek";
process.env["DEEPSEEK_API_KEY"] = "sk-test";
process.env["DEEPSEEK_BASE_URL"] = "https://api.deepseek.com";
// dotenv no pisa variables ya definidas: vacío = "usar el modelo por defecto", sin importar el .env real.
process.env["AI_MODEL"] = "";
process.env["AI_THINKING"] = "false";

const { aiChat, aiModel, buildDeepseekBody, isAiConfigured, tokenBudget } = await import("../src/lib/ai.js");
const { tagGarment } = await import("../src/modules/processing/ai-tagging.js");
const { pickOutfitsWithAi } = await import("../src/modules/outfits/ai-recommend.js");
const { buildCandidates } = await import("../src/modules/outfits/rules.js");

const reply = (content: string, finish_reason = "stop") =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const body = (call = 0) => JSON.parse((fetchMock.mock.calls[call]![1] as { body: string }).body);

describe("configuración", () => {
  it("usa DeepSeek con su modelo por defecto", () => {
    expect(isAiConfigured()).toBe(true);
    expect(aiModel()).toBe("deepseek-flash");
    expect(tokenBudget(1000)).toBe(1000); // sin razonamiento no se amplía
  });
});

describe("modelo configurado", () => {
  it("un AI_MODEL de otro proveedor se ignora (no se manda 'claude-*' a DeepSeek)", async () => {
    vi.resetModules();
    process.env["AI_MODEL"] = "claude-sonnet-5-5";
    const fresh = await import("../src/lib/ai.js");
    expect(fresh.aiModel()).toBe("deepseek-flash");
    process.env["AI_MODEL"] = "deepseek-v4-pro";
    vi.resetModules();
    expect((await import("../src/lib/ai.js")).aiModel()).toBe("deepseek-v4-pro");
    process.env["AI_MODEL"] = "";
  });
});

describe("petición a DeepSeek", () => {
  it("texto: JSON mode, sin razonamiento y con la clave en Authorization", async () => {
    fetchMock.mockResolvedValueOnce(reply('{"ok":true}'));
    const out = await aiChat({ system: "sistema JSON", text: "hola", maxTokens: 500 });

    expect(out).toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init as { headers: Record<string, string> }).headers["Authorization"]).toBe("Bearer sk-test");
    const b = body();
    expect(b.model).toBe("deepseek-flash");
    expect(b.response_format).toEqual({ type: "json_object" });
    expect(b.thinking).toEqual({ type: "disabled" });
    expect(b.max_tokens).toBe(500);
    expect(b.messages[0]).toEqual({ role: "system", content: "sistema JSON" });
    expect(b.messages[1]).toEqual({ role: "user", content: "hola" });
  });

  it("imagen: se envía como image_url en base64", () => {
    const b = buildDeepseekBody({ system: "s", text: "t", image: Buffer.from("abc"), maxTokens: 10 });
    const content = b.messages[1]!.content as { type: string; image_url?: { url: string }; text?: string }[];
    expect(content[0]).toEqual({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from("abc").toString("base64")}` } });
    expect(content[1]).toEqual({ type: "text", text: "t" });
  });
});

describe("errores y reintentos", () => {
  it("reintenta con 429 y 5xx y luego responde", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(reply("{}"));
    const p = aiChat({ system: "s", text: "t", maxTokens: 10 });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toBe("{}");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("no reintenta con clave inválida (401) ni saldo insuficiente (402)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(aiChat({ system: "s", text: "t", maxTokens: 10 })).rejects.toMatchObject({ code: "AI_BAD_KEY" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 402 }));
    await expect(aiChat({ system: "s", text: "t", maxTokens: 10 })).rejects.toMatchObject({ code: "AI_NO_BALANCE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("detecta respuestas cortadas, vacías y filtradas", async () => {
    fetchMock.mockResolvedValueOnce(reply("{", "length"));
    await expect(aiChat({ system: "s", text: "t", maxTokens: 10 })).rejects.toMatchObject({ code: "AI_TRUNCATED" });
    fetchMock.mockResolvedValueOnce(reply(""));
    await expect(aiChat({ system: "s", text: "t", maxTokens: 10 })).rejects.toMatchObject({ code: "AI_EMPTY" });
    fetchMock.mockResolvedValueOnce(reply("{}", "content_filter"));
    await expect(aiChat({ system: "s", text: "t", maxTokens: 10 })).rejects.toMatchObject({ code: "AI_REFUSAL" });
  });

  it("falla con un error claro si no hay red tras los reintentos", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const p = aiChat({ system: "s", text: "t", maxTokens: 10 });
    const assertion = expect(p).rejects.toMatchObject({ code: "AI_UNREACHABLE" });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });
});

describe("etiquetado de prendas (imagen -> JSON validado)", () => {
  const valid = {
    categoria: "top",
    subcategoria: "camisa",
    colores: [{ nombre: "blanco", hex: "#FFFFFF" }],
    patron: "liso",
    material: "algodón",
    formalidad: 3,
    temporadas: ["verano"],
    ocasiones: ["casual"],
    descripcion: "Camisa blanca",
  };

  it("devuelve las etiquetas y manda la imagen", async () => {
    fetchMock.mockResolvedValueOnce(reply(JSON.stringify(valid)));
    const tags = await tagGarment(Buffer.from("jpeg"));
    expect(tags.categoria).toBe("top");
    expect(body().messages[1].content[0].type).toBe("image_url");
    expect(body().messages[1].content[1].text).toMatch(/JSON/);
  });

  it("si el JSON no valida, reintenta una vez avisando del error", async () => {
    fetchMock.mockResolvedValueOnce(reply(JSON.stringify({ ...valid, categoria: "sombrero" }))).mockResolvedValueOnce(reply(JSON.stringify(valid)));
    const tags = await tagGarment(Buffer.from("jpeg"));
    expect(tags.subcategoria).toBe("camisa");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1).messages[1].content[1].text).toMatch(/no cumplió el formato/);
  });

  it("si falla dos veces, lanza (la prenda queda lista sin etiquetas)", async () => {
    fetchMock.mockResolvedValue(reply("no es json"));
    await expect(tagGarment(Buffer.from("jpeg"))).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un error de saldo no se reintenta", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 402 }));
    await expect(tagGarment(Buffer.from("jpeg"))).rejects.toMatchObject({ code: "AI_NO_BALANCE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("recomendación de outfits", () => {
  it("manda solo metadatos (sin imagen) y valida la respuesta", async () => {
    const mk = (id: string, categoria: "top" | "bottom" | "calzado") => ({
      id,
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
    });
    const pool = [mk("t1", "top"), mk("b1", "bottom"), mk("c1", "calzado")];
    const candidates = buildCandidates(pool, {});
    fetchMock.mockResolvedValueOnce(
      reply(JSON.stringify({ outfits: [{ prendas: ["t1", "b1", "c1"], nombre: "Básico", explicacion: "Neutros y cómodo." }] })),
    );

    const out = await pickOutfitsWithAi({ pool, candidates, requeridas: [], meGustaron: [], noMeGustaron: [] });
    expect(out.outfits[0]?.prendas).toEqual(["t1", "b1", "c1"]);
    const sent = body();
    expect(typeof sent.messages[1].content).toBe("string"); // texto plano, sin partes de imagen
    expect(sent.response_format).toEqual({ type: "json_object" });
  });
});
