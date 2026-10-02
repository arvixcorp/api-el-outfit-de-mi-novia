import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler, currentUser, ok } from "../../utils/http.js";
import { authService } from "./auth.service.js";
import { loginSchema, refreshSchema, registerSchema, updateProfileSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => ok(res, await authService.register(req.body), 201, "Cuenta creada")),
);

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => ok(res, await authService.login(req.body), 200, "Inicio de sesión exitoso")),
);

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => ok(res, await authService.refresh(req.body.refreshToken))),
);

authRouter.post(
  "/logout",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    ok(res, {});
  }),
);

authRouter.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => ok(res, await authService.me(currentUser(req).id))),
);

authRouter.patch(
  "/me",
  authMiddleware,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => ok(res, await authService.updateProfile(currentUser(req).id, req.body))),
);
