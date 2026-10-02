import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";

let server: Server;
let base: string;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("rutas protegidas y validación (no tocan la base de datos)", () => {
  it("garments exige token", async () => {
    const res = await fetch(`${base}/api/v1/garments`);
    expect(res.status).toBe(401);
  });

  it("rechaza un token inválido", async () => {
    const res = await fetch(`${base}/api/v1/garments`, { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });

  it("register valida el cuerpo", async () => {
    const res = await post("/api/v1/auth/register", { email: "no-es-email", password: "1" });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
  });

  it("ruta inexistente devuelve 404 en JSON", async () => {
    const res = await fetch(`${base}/api/v1/nada`);
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });
});
