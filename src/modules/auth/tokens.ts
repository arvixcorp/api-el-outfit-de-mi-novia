import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export function signAccessToken(user: { id: string; email: string }): string {
  return jwt.sign({ email: user.email }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** Token opaco aleatorio; en la base solo se guarda su hash SHA-256. */
export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(48).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
