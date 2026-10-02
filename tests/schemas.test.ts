import { describe, expect, it } from "vitest";
import { registerSchema } from "../src/modules/auth/auth.schemas.js";
import {
  listGarmentsSchema,
  updateGarmentSchema,
  uploadUrlSchema,
} from "../src/modules/garments/garments.schemas.js";
import { generateRefreshToken, hashToken } from "../src/modules/auth/tokens.js";
import { resolveDatabaseUrl } from "../src/config/database-url.js";

describe("registerSchema", () => {
  it("normaliza el email", () => {
    const r = registerSchema.parse({ email: "  Ana@Mail.COM ", password: "12345678", nombre: "Ana" });
    expect(r.email).toBe("ana@mail.com");
  });

  it("rechaza contraseñas cortas", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "123", nombre: "Ana" }).success).toBe(false);
  });
});

describe("uploadUrlSchema", () => {
  it("acepta jpeg dentro del límite", () => {
    expect(uploadUrlSchema.safeParse({ contentType: "image/jpeg", sizeBytes: 1_000_000 }).success).toBe(true);
  });

  it("rechaza tipos no permitidos y tamaños excesivos", () => {
    expect(uploadUrlSchema.safeParse({ contentType: "application/pdf", sizeBytes: 10 }).success).toBe(false);
    expect(uploadUrlSchema.safeParse({ contentType: "image/png", sizeBytes: 20 * 1024 * 1024 }).success).toBe(false);
  });
});

describe("updateGarmentSchema", () => {
  it("rechaza un cuerpo vacío", () => {
    expect(updateGarmentSchema.safeParse({}).success).toBe(false);
  });

  it("valida formalidad, hex y temporadas", () => {
    expect(updateGarmentSchema.safeParse({ formalidad: 6 }).success).toBe(false);
    expect(updateGarmentSchema.safeParse({ colorDominanteHex: "rojo" }).success).toBe(false);
    expect(updateGarmentSchema.safeParse({ temporadas: ["verano", "otoño"], formalidad: 3 }).success).toBe(true);
  });
});

describe("listGarmentsSchema", () => {
  it("aplica límite por defecto y convierte favorito", () => {
    const q = listGarmentsSchema.parse({ favorito: "true" });
    expect(q.limit).toBe(40);
    expect(q.favorito).toBe(true);
  });
});

describe("tokens", () => {
  it("el hash del refresh token es estable y distinto del token", () => {
    const { token, hash } = generateRefreshToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toBe(token);
  });
});

describe("resolveDatabaseUrl", () => {
  it("prefiere DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "mysql://a:b@h:1/d", MYSQL_HOST: "x" })).toBe("mysql://a:b@h:1/d");
  });

  it("arma la URL y codifica la contraseña", () => {
    const url = resolveDatabaseUrl({
      MYSQL_HOST: "h",
      MYSQL_PORT: "3311",
      MYSQL_DATABASENAME: "db",
      MYSQL_USER: "u",
      MYSQL_PASSWORD: "p@ss/word",
    });
    expect(url).toBe("mysql://u:p%40ss%2Fword@h:3311/db");
  });

  it("devuelve undefined si faltan datos", () => {
    expect(resolveDatabaseUrl({ MYSQL_HOST: "h" })).toBeUndefined();
  });
});
