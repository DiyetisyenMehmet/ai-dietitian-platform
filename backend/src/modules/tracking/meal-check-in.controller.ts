import type { Request } from "express";
import { Prisma } from "@prisma/client";

import { ApiError } from "../../utils/api-error";
import { sendSuccess } from "../../utils/api-response";
import { asyncHandler } from "../../utils/async-handler";
import { mealCheckInRepository } from "./meal-check-in.repository";
import { checkInRevisionSchema, type CheckInDay, type CheckInIdentity } from "./meal-check-in.schemas";

function owner(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}
async function ready<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      throw new ApiError(503, "Meal check-in storage is not ready.", { code: "MEAL_CHECK_IN_NOT_READY" });
    }
    throw error;
  }
}
function change(active: boolean) {
  return asyncHandler(async (req, res) => {
    const revision = checkInRevisionSchema.safeParse(req.get("If-Match"));
    if (!revision.success) throw ApiError.unprocessable('If-Match must contain a quoted revision, e.g. "0".');
    const key: CheckInIdentity = { planId: req.params.planId,
      dayNumber: Number(req.params.dayNumber), mealIndex: Number(req.params.mealIndex),
      localDate: req.query.localDate as string };
    const checkIn = await ready(() => mealCheckInRepository.setState(owner(req), key, active, revision.data));
    res.set("ETag", `"${checkIn.revision}"`).set("Cache-Control", "no-store");
    sendSuccess(res, { checkIn });
  });
}
export const mealCheckInController = {
  list: asyncHandler(async (req, res) => {
    const day = await ready(() => mealCheckInRepository.listDay(owner(req), req.query as unknown as CheckInDay));
    res.set("Cache-Control", "no-store");
    sendSuccess(res, { day });
  }),
  confirm: change(true), undo: change(false),
};
