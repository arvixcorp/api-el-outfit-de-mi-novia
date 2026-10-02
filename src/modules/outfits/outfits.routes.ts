import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { asyncHandler, currentUser, ok } from "../../utils/http.js";
import { outfitsService } from "./outfits.service.js";
import {
  completeSchema,
  createOutfitSchema,
  feedbackSchema,
  listOutfitsSchema,
  recommendSchema,
  updateOutfitSchema,
  wearLogQuerySchema,
  wearSchema,
  OCASIONES_OUTFIT,
} from "./outfits.schemas.js";

export const outfitsRouter = Router();
export const wearLogRouter = Router();

const idParams = z.object({ id: z.uuid("Id inválido") });
const todayQuery = z.object({ ocasion: z.enum(OCASIONES_OUTFIT).optional() });
const id = (req: { params: Record<string, string | undefined> }) => req.params["id"] as string;

outfitsRouter.use(authMiddleware);
wearLogRouter.use(authMiddleware);

outfitsRouter.post(
  "/recommend",
  validate(recommendSchema),
  asyncHandler(async (req, res) => ok(res, await outfitsService.recommend(currentUser(req).id, req.body))),
);

outfitsRouter.post(
  "/complete",
  validate(completeSchema),
  asyncHandler(async (req, res) => ok(res, await outfitsService.complete(currentUser(req).id, req.body))),
);

/** "Hoy": recomendacion del dia segun el clima de su ciudad (cacheada). */
outfitsRouter.get(
  "/today",
  validate(todayQuery, "query"),
  asyncHandler(async (req, res) =>
    ok(res, await outfitsService.recommend(currentUser(req).id, { ocasion: (req.query as { ocasion?: never }).ocasion })),
  ),
);

outfitsRouter.get(
  "/gaps",
  asyncHandler(async (req, res) => ok(res, await outfitsService.gaps(currentUser(req).id))),
);

outfitsRouter.post(
  "/",
  validate(createOutfitSchema),
  asyncHandler(async (req, res) => ok(res, await outfitsService.createManual(currentUser(req).id, req.body), 201)),
);

outfitsRouter.get(
  "/",
  validate(listOutfitsSchema, "query"),
  asyncHandler(async (req, res) => ok(res, await outfitsService.list(currentUser(req).id, req.query as never))),
);

outfitsRouter.get(
  "/:id",
  validate(idParams, "params"),
  asyncHandler(async (req, res) => ok(res, await outfitsService.get(currentUser(req).id, id(req)))),
);

outfitsRouter.patch(
  "/:id",
  validate(idParams, "params"),
  validate(updateOutfitSchema),
  asyncHandler(async (req, res) => ok(res, await outfitsService.update(currentUser(req).id, id(req), req.body))),
);

outfitsRouter.delete(
  "/:id",
  validate(idParams, "params"),
  asyncHandler(async (req, res) => {
    await outfitsService.remove(currentUser(req).id, id(req));
    ok(res, {});
  }),
);

outfitsRouter.post(
  "/:id/feedback",
  validate(idParams, "params"),
  validate(feedbackSchema),
  asyncHandler(async (req, res) =>
    ok(res, await outfitsService.addFeedback(currentUser(req).id, id(req), req.body.rating, req.body.comentario), 201),
  ),
);

outfitsRouter.post(
  "/:id/wear",
  validate(idParams, "params"),
  validate(wearSchema),
  asyncHandler(async (req, res) =>
    ok(res, await outfitsService.markWorn(currentUser(req).id, id(req), req.body.fecha), 201),
  ),
);

// Calendario de uso: GET /wear-log?desde=2026-10-01&hasta=2026-10-31
wearLogRouter.get(
  "/",
  validate(wearLogQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.query as { desde: string; hasta: string };
    ok(res, await outfitsService.wearLog(currentUser(req).id, desde, hasta));
  }),
);

wearLogRouter.delete(
  "/:id",
  validate(idParams, "params"),
  asyncHandler(async (req, res) => {
    await outfitsService.removeWear(currentUser(req).id, id(req));
    ok(res, {});
  }),
);
