import app from "./app.js";
import { announce } from "./config/banner.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./lib/prisma.js";
import { processingWorker } from "./modules/processing/worker.js";

const server = app.listen(env.PORT, () => {
  void announce()
    .catch((err) => logger.error("No se pudo mostrar el estado de arranque", err))
    .finally(() => processingWorker.start());
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") logger.error(`El puerto ${env.PORT} ya está en uso. ¿Hay otra instancia de la API corriendo?`);
  else logger.error("Error del servidor", err);
  process.exit(1);
});

async function shutdown(signal: string) {
  logger.info(`${signal} recibido, cerrando…`);
  processingWorker.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
