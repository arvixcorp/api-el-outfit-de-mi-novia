import { Router } from "express";
// import authRoutes from "./auth/auth.routes.js";
// import reportesRoutes from "./reportes/reportes.routes.js";
// import { healthRouter } from "../controllers/health.controller.js";
import { healthMySQLRouter } from "../controllers/health2.controller.js";


const router = Router();

// Módulos
// router.use("/auth", authRoutes);
// router.use("/reportes", reportesRoutes);

// Rutas globales o de infraestructura
// Sequelize
// router.use("/health-sequelize", healthRouter);
// MySQL
router.use("/health-mysql", healthMySQLRouter);


export default router;
