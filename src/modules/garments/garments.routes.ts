import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler, currentUser, ok } from "../../utils/http.js";
import { garmentsService } from "./garments.service.js";
import {
  idParamsSchema,
  listGarmentsSchema,
  updateGarmentSchema,
  uploadUrlSchema,
} from "./garments.schemas.js";

export const garmentsRouter = Router();

garmentsRouter.use(authMiddleware);

garmentsRouter.post(
  "/upload-url",
  validate(uploadUrlSchema),
  asyncHandler(async (req, res) => ok(res, await garmentsService.createUpload(currentUser(req).id, req.body), 201)),
);

garmentsRouter.post(
  "/:id/upload-url",
  validate(idParamsSchema, "params"),
  validate(uploadUrlSchema),
  asyncHandler(async (req, res) =>
    ok(res, await garmentsService.renewUpload(currentUser(req).id, req.params["id"] as string, req.body)),
  ),
);

garmentsRouter.get(
  "/",
  validate(listGarmentsSchema, "query"),
  asyncHandler(async (req, res) =>
    ok(res, await garmentsService.list(currentUser(req).id, req.query as never)),
  ),
);

garmentsRouter.post(
  "/:id/confirm",
  validate(idParamsSchema, "params"),
  asyncHandler(async (req, res) =>
    ok(res, await garmentsService.confirmUpload(currentUser(req).id, req.params["id"] as string)),
  ),
);

garmentsRouter.post(
  "/:id/retry",
  validate(idParamsSchema, "params"),
  asyncHandler(async (req, res) => ok(res, await garmentsService.retry(currentUser(req).id, req.params["id"] as string))),
);

garmentsRouter.get(
  "/:id",
  validate(idParamsSchema, "params"),
  asyncHandler(async (req, res) => ok(res, await garmentsService.get(currentUser(req).id, req.params["id"] as string))),
);

garmentsRouter.patch(
  "/:id",
  validate(idParamsSchema, "params"),
  validate(updateGarmentSchema),
  asyncHandler(async (req, res) =>
    ok(res, await garmentsService.update(currentUser(req).id, req.params["id"] as string, req.body)),
  ),
);

garmentsRouter.delete(
  "/:id",
  validate(idParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await garmentsService.remove(currentUser(req).id, req.params["id"] as string);
    ok(res, {});
  }),
);
