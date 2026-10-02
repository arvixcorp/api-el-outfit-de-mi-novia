import morgan from "morgan";
import { c, colorEnabled } from "./colors.js";

const method = (m: string) => {
  const padded = m.padEnd(6);
  if (m === "GET") return c.green(padded);
  if (m === "POST") return c.yellow(padded);
  if (m === "PATCH" || m === "PUT") return c.blue(padded);
  if (m === "DELETE") return c.red(padded);
  return c.magenta(padded);
};

const status = (code: number) =>
  code >= 500 ? c.red(code) : code >= 400 ? c.yellow(code) : code >= 300 ? c.cyan(code) : c.green(code);

const duration = (ms: number) => {
  const text = ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  return ms >= 1000 ? c.red(text) : ms >= 400 ? c.yellow(text) : c.gray(text);
};

/**
 * Una línea por petición:  "  GET    /api/v1/health          200  12ms".
 * En desarrollo va con colores; en producción usa el formato estándar de morgan.
 */
export const requestLogger = colorEnabled
  ? morgan((tokens, req, res) => {
      const url = (tokens["url"]?.(req, res) ?? "").slice(0, 70).padEnd(40);
      const code = Number(tokens["status"]?.(req, res) ?? 0);
      const ms = Number(tokens["response-time"]?.(req, res) ?? 0);
      return `${c.gray("  →")} ${method(req.method ?? "")} ${url} ${status(code)} ${duration(ms)}`;
    })
  : morgan("short");
