import type { ErrorRequestHandler } from "express";
import { AppError, ValidationError } from "../common/errors/AppError.js";
import { logger } from "../config/logger.js";

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    // En validaciones se muestra qué campo falló, para no tener que adivinar.
    const detalle =
      err instanceof ValidationError && Array.isArray(err.details)
        ? ` → ${(err.details as { campo: string; mensaje: string }[]).map((d) => `${d.campo || "(cuerpo)"}: ${d.mensaje}`).join("; ")}`
        : "";
    logger.warn(`[${err.statusCode}] ${err.message}${detalle}`);
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err instanceof ValidationError && err.details ? { errors: err.details } : {}),
    });
    return;
  }

  logger.error("Error interno", err);
  res.status(500).json({ success: false, message: "Error interno del servidor" });
};
