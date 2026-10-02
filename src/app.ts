import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requestLogger } from "./config/request-log.js";
import routes from "./modules/index.js";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { NotFoundError } from "./common/errors/AppError.js";

const app = express();

const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim());

app.use(helmet());
app.use(cors({ origin: origins.includes("*") ? true : origins }));
app.use(express.json({ limit: "1mb" }));
if (env.NODE_ENV !== "test") app.use(requestLogger);

app.get("/", (_req, res) => {
  res.json({ message: "API El outfit de mi novia", time: new Date().toISOString() });
});

app.use("/api/v1", routes);

app.use((_req, _res, next) => next(new NotFoundError("Ruta no encontrada")));
app.use(errorMiddleware);

export default app;
