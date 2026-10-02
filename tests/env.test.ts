import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const base = {
  DATABASE_URL: "mysql://u:p@localhost:3306/db",
  JWT_ACCESS_SECRET: "x".repeat(32),
  S3_BUCKET: "mi-bucket",
};

describe("parseEnv", () => {
  it("aplica valores por defecto (AWS S3, rembg, DeepSeek)", () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.BG_REMOVAL_PROVIDER).toBe("rembg");
    expect(env.AI_PROVIDER).toBe("deepseek");
  });

  it("falla si falta DATABASE_URL", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("falla si falta el bucket de S3", () => {
    expect(() => parseEnv({ ...base, S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
  });

  it("rechaza secretos JWT cortos", () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: "corto" })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
