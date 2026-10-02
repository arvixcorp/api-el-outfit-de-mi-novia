import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { processGarment } from "./pipeline.js";

const STALE_AFTER_MS = 10 * 60 * 1000;

/** Segundos de espera antes del siguiente intento: 30s, 2min, 8min... */
export function backoffMs(attempt: number): number {
  return 30_000 * 4 ** Math.max(0, attempt - 1);
}

let timer: NodeJS.Timeout | undefined;
let running = false;
let stopped = true;
let wakeRequested = false;

/** Devuelve a `pending` los trabajos que quedaron en `processing` (p. ej. la API se reinicio). */
async function recoverStale() {
  await prisma.garment.updateMany({
    where: { estadoProcesamiento: "processing", procesandoDesde: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    data: { estadoProcesamiento: "pending", procesandoDesde: null },
  });
}

/** Toma el siguiente trabajo de forma atomica (varias instancias no lo duplican). */
async function claimNext() {
  const candidates = await prisma.garment.findMany({
    where: {
      estadoProcesamiento: "pending",
      confirmedAt: { not: null },
      deletedAt: null,
      OR: [{ proximoIntento: null }, { proximoIntento: { lte: new Date() } }],
    },
    orderBy: { confirmedAt: "asc" },
    take: 5,
  });

  for (const candidate of candidates) {
    const claim = await prisma.garment.updateMany({
      where: { id: candidate.id, estadoProcesamiento: "pending" },
      data: { estadoProcesamiento: "processing", procesandoDesde: new Date() },
    });
    if (claim.count === 1) return candidate;
  }
  return null;
}

async function runOne(): Promise<boolean> {
  const garment = await claimNext();
  if (!garment) return false;

  logger.info(`Procesando prenda ${garment.id}`);
  try {
    const patch = await processGarment(garment);
    await prisma.garment.update({ where: { id: garment.id }, data: { ...patch, intentos: { increment: 1 } } });
    logger.info(`Prenda ${garment.id} lista`);
  } catch (err) {
    const intentos = garment.intentos + 1;
    const message = String(err instanceof Error ? err.message : err).slice(0, 500);
    const definitivo = intentos >= env.WORKER_MAX_ATTEMPTS;
    logger.error(`Prenda ${garment.id} falló (intento ${intentos}/${env.WORKER_MAX_ATTEMPTS}): ${message}`);

    // La imagen original se conserva siempre; solo cambia el estado.
    await prisma.garment.update({
      where: { id: garment.id },
      data: {
        estadoProcesamiento: definitivo ? "failed" : "pending",
        intentos,
        errorProcesamiento: message,
        procesandoDesde: null,
        proximoIntento: definitivo ? null : new Date(Date.now() + backoffMs(intentos)),
      },
    });
  }
  return true;
}

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    do {
      wakeRequested = false;
      await recoverStale();
      while (!stopped && (await runOne())) {
        /* sigue con el siguiente trabajo */
      }
    } while (wakeRequested && !stopped);
  } catch (err) {
    logger.error("Error en el worker de procesamiento", err);
  } finally {
    running = false;
  }
}

export const processingWorker = {
  start() {
    if (!stopped || !env.WORKER_ENABLED) return;
    stopped = false;
    timer = setInterval(() => void tick(), env.WORKER_POLL_MS);
    void tick();
    logger.debug("Worker de procesamiento iniciado");
  },

  /** Despierta al worker de inmediato (se llama al confirmar una subida). */
  kick() {
    if (stopped) return;
    wakeRequested = true;
    void tick();
  },

  stop() {
    stopped = true;
    if (timer) clearInterval(timer);
  },
};
