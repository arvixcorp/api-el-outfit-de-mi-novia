import { env } from "./env.js";
import { logger } from "./logger.js";
import { c, colorEnabled } from "./colors.js";
import { aiModel, isAiConfigured } from "../lib/ai.js";
import { prisma } from "../lib/prisma.js";

interface Line {
  ok: boolean | "off";
  label: string;
  detail: string;
}

const EXAMPLE_JWT = "cambia-esto";

function databaseLabel(): string {
  try {
    const u = new URL(env.DATABASE_URL);
    return `${u.hostname}:${u.port || "3306"}${u.pathname}`; // sin usuario ni contraseña
  } catch {
    return "(URL inválida)";
  }
}

async function pingDatabase(): Promise<string | null> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.split("\n").pop()!.slice(0, 120) : "sin conexión";
  }
}

async function collect(): Promise<{ lines: Line[]; warnings: string[] }> {
  const dbError = await pingDatabase();
  const warnings: string[] = [];

  const storageOk = !!env.S3_ACCESS_KEY && !!env.S3_SECRET_KEY;
  const storageTarget = env.S3_ENDPOINT ? env.S3_ENDPOINT : `AWS S3 · ${env.S3_REGION}`;
  const bgOk = env.BG_REMOVAL_PROVIDER === "rembg" ? !!env.REMBG_URL : !!env.BG_REMOVAL_EXTERNAL_URL;
  const bgTarget =
    env.BG_REMOVAL_PROVIDER === "rembg"
      ? `rembg · ${env.REMBG_URL}`
      : `externo · ${env.BG_REMOVAL_EXTERNAL_URL ?? "sin URL"} · campo "${env.BG_REMOVAL_EXTERNAL_FIELD}"${env.BG_REMOVAL_EXTERNAL_FORM ? ` + ${env.BG_REMOVAL_EXTERNAL_FORM}` : ""}`;

  if (env.JWT_ACCESS_SECRET.startsWith(EXAMPLE_JWT)) warnings.push("JWT_ACCESS_SECRET es el valor de ejemplo: cámbialo antes de desplegar.");
  if (env.CORS_ORIGINS === "*" && env.NODE_ENV === "production") warnings.push("CORS_ORIGINS=* en producción.");
  if (env.S3_ENDPOINT?.includes("localhost") && env.NODE_ENV === "production") warnings.push("S3_ENDPOINT apunta a localhost en producción.");

  const lines: Line[] = [
    { ok: !dbError, label: "Base de datos", detail: dbError ? `${databaseLabel()} — ${dbError}` : `${databaseLabel()} · conectada` },
    { ok: storageOk, label: "Almacenamiento", detail: storageOk ? `${storageTarget} · bucket ${env.S3_BUCKET} · credenciales cargadas` : "faltan S3_ACCESS_KEY / S3_SECRET_KEY" },
    { ok: bgOk, label: "Quitar fondo", detail: bgTarget },
    {
      ok: isAiConfigured(),
      label: "IA",
      detail: isAiConfigured() ? `${env.AI_PROVIDER} · ${aiModel()}` : `falta la clave de ${env.AI_PROVIDER} (se usarán reglas y prendas sin etiquetas)`,
    },
    { ok: env.WORKER_ENABLED ? true : "off", label: "Worker", detail: env.WORKER_ENABLED ? `cola activa, revisa cada ${env.WORKER_POLL_MS / 1000}s` : "desactivado (WORKER_ENABLED=false)" },
  ];
  return { lines, warnings };
}

const icon = (ok: Line["ok"]) => (ok === true ? c.green("✔") : ok === "off" ? c.gray("○") : c.red("✖"));

/** Muestra qué quedó corriendo al arrancar. En producción emite una sola línea JSON. */
export async function announce(): Promise<void> {
  const { lines, warnings } = await collect();
  const base = `http://localhost:${env.PORT}`;

  if (!colorEnabled) {
    logger.info("API lista", {
      url: base,
      env: env.NODE_ENV,
      services: Object.fromEntries(lines.map((l) => [l.label, { ok: l.ok, detail: l.detail }])),
      warnings,
    });
    return;
  }

  const title = " El outfit de mi novia · API ";
  const width = title.length + 6;
  const out: string[] = [
    "",
    c.pink(`  ╭${"─".repeat(width)}╮`),
    `${c.pink("  │")}${" ".repeat(3)}${c.bold(c.rose(`✿ ${title.trim()}`.slice(0, width - 4)))}${" ".repeat(Math.max(1, width - title.trim().length - 5))}${c.pink("│")}`,
    c.pink(`  ╰${"─".repeat(width)}╯`),
    "",
    `  ${c.green("●")} ${c.bold("Corriendo")} en ${c.cyan(base)}   ${c.gray(`(${env.NODE_ENV})`)}`,
    `  ${c.gray("  salud:")} ${c.cyan(`${base}/api/v1/health`)}`,
    "",
    ...lines.map((l) => `  ${icon(l.ok)} ${c.bold(l.label.padEnd(15))} ${l.ok === true || l.ok === "off" ? c.gray(l.detail) : c.red(l.detail)}`),
  ];
  if (warnings.length) out.push("", ...warnings.map((w) => `  ${c.yellow("⚠")} ${c.yellow(w)}`));
  out.push("", c.gray("  Peticiones:"), "");
  console.log(out.join("\n"));
}
