import winston from "winston";
import { badge, c } from "./colors.js";
import { env } from "./env.js";

const production = env.NODE_ENV === "production";

const LEVELS: Record<string, string> = {
  error: badge("ERROR", 41),
  warn: badge("WARN ", 43),
  info: badge("INFO ", 46),
  debug: badge("DEBUG", 100),
};

const clock = (iso?: string) => (iso ? new Date(iso) : new Date()).toLocaleTimeString("es", { hour12: false });

/** Formato legible para desarrollo: hora tenue, insignia de nivel con color, mensaje y detalles. */
const pretty = winston.format.printf((info) => {
  const { level, message, timestamp, stack, ...meta } = info as Record<string, unknown> & { level: string; message: unknown };
  const rest = Object.keys(meta).filter((k) => !["splat"].includes(k));
  const extra = rest.length ? ` ${c.gray(JSON.stringify(Object.fromEntries(rest.map((k) => [k, meta[k]]))))}` : "";
  const text = level === "error" ? c.red(String(message)) : level === "warn" ? c.yellow(String(message)) : String(message);
  const trace = typeof stack === "string" ? `\n${c.gray(stack.split("\n").slice(1, 6).join("\n"))}` : "";
  return `${c.gray(clock(timestamp as string))} ${LEVELS[level] ?? level} ${text}${extra}${trace}`;
});

export const logger = winston.createLogger({
  level: production ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    production ? winston.format.json() : pretty,
  ),
  transports: [new winston.transports.Console()],
  silent: env.NODE_ENV === "test",
});
