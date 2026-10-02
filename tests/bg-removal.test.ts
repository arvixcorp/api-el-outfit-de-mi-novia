import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env["BG_REMOVAL_PROVIDER"] = "external";
process.env["BG_REMOVAL_EXTERNAL_URL"] = "https://api.rembg.com/rmbg";
process.env["BG_REMOVAL_EXTERNAL_API_KEY"] = "secret-key";
process.env["BG_REMOVAL_EXTERNAL_FIELD"] = "image";
process.env["BG_REMOVAL_EXTERNAL_FORM"] = "format=PNG";

const { removeBackground, parseExtraForm } = await import("../src/modules/processing/bg-removal.js");

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("quitar fondo con API externa (formato rembg.com)", () => {
  it("envía la imagen en el campo configurado, la clave en el header y los campos extra", async () => {
    const out = await removeBackground(Buffer.from("jpeg"));
    expect([...out]).toEqual([1, 2, 3]);

    const [url, init] = fetchMock.mock.calls[0]! as [string, { method: string; headers: Record<string, string>; body: FormData }];
    expect(url).toBe("https://api.rembg.com/rmbg");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("secret-key");
    expect(init.body.get("image")).toBeInstanceOf(Blob); // campo "image", no "image_file"
    expect(init.body.has("image_file")).toBe(false);
    expect(init.body.get("format")).toBe("PNG"); // sin esto devolvería WebP
  });

  it("un error del servicio se informa con su código", async () => {
    fetchMock.mockResolvedValueOnce(new Response("sin créditos", { status: 429 }));
    await expect(removeBackground(Buffer.from("x"))).rejects.toMatchObject({ code: "BG_REMOVAL_FAILED", message: expect.stringContaining("429") });
  });
});

describe("parseExtraForm", () => {
  it("convierte query string en campos", () => {
    expect(parseExtraForm("format=PNG&type=product")).toEqual({ format: "PNG", type: "product" });
    expect(parseExtraForm("?format=PNG")).toEqual({ format: "PNG" });
    expect(parseExtraForm("")).toEqual({});
  });
});
