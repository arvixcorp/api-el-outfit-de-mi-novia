import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: "ok", db: "up", time: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});
