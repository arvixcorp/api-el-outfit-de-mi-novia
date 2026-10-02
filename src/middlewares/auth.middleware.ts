import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../common/errors/AppError.js";

export interface AuthUser {
  id: string;
  email: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    next(new UnauthorizedError("Token no proporcionado"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    req.user = { id: String(payload.sub), email: String(payload["email"]) };
    next();
  } catch {
    next(new UnauthorizedError("Token inválido o expirado"));
  }
};
