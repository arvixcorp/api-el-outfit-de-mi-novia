import { Router } from "express";
import { healthRouter } from "./health/health.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { garmentsRouter } from "./garments/garments.routes.js";
import { outfitsRouter, wearLogRouter } from "./outfits/outfits.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/garments", garmentsRouter);
router.use("/outfits", outfitsRouter);
router.use("/wear-log", wearLogRouter);

export default router;
