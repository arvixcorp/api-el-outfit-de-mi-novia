import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../common/errors/AppError.js";

type Source = "body" | "query" | "params";

/** Valida y reemplaza req[source] con el resultado parseado por Zod. */
export const validate =
  (schema: ZodType, source: Source = "body"): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        campo: i.path.join("."),
        mensaje: i.message,
      }));
      next(new ValidationError("Datos inválidos", errors));
      return;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
