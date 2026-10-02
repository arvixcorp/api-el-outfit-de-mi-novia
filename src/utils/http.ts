import type { Request, RequestHandler, Response } from "express";
import { UnauthorizedError } from "../common/errors/AppError.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";

/** Express 4 no captura promesas rechazadas: las envia a next(). */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const ok = (res: Response, data: unknown, status = 200, message?: string) => {
  res.status(status).json({ success: true, ...(message ? { message } : {}), data });
};

export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};
