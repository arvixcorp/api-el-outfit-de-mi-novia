import { describe, expect, it } from "vitest";
import { storage } from "../src/lib/storage.js";

describe("storage (firma local, sin red)", () => {
  it("genera una URL prefirmada de subida con tipo y tamaño firmados", async () => {
    const url = new URL(await storage.presignUpload("users/u/garments/g/original.jpg", "image/jpeg", 1234));
    expect(url.pathname).toContain("users/u/garments/g/original.jpg");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
  });

  it("devuelve null para claves vacías", async () => {
    expect(await storage.urlFor(null)).toBeNull();
  });
});
