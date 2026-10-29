import { Prisma, type PrismaClient, type MealCheckInState } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/api-error";
import { resolveCheckInDay } from "./meal-check-in-plan";
import type { CheckInDay, CheckInIdentity } from "./meal-check-in.schemas";

async function requirePlan(tx: Prisma.TransactionClient, userId: string, input: CheckInDay) {
  // The lock is shared by all server instances, including first inserts.
  // Order: user -> plan -> check-in. Plan changes/deletion wait for validation.
  const users = await tx.$queryRaw<Array<{ isActive: boolean }>>`
    SELECT "isActive" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
  if (!users[0]?.isActive) throw ApiError.unauthorized("Session is no longer valid.");
  await tx.$queryRaw`SELECT "id" FROM "nutrition_plans"
    WHERE "id" = ${input.planId} AND "userId" = ${userId} FOR SHARE`;
  const plan = await tx.nutritionPlan.findFirst({
    where: { id: input.planId, userId, deletedAt: null },
  });
  if (!plan) throw ApiError.notFound("Nutrition plan not found.");
  return resolveCheckInDay(plan, input);
}

export function createMealCheckInRepository(db: PrismaClient) {
  return {
    listDay(userId: string, input: CheckInDay) {
      return db.$transaction(
        async (tx) => {
          const context = await requirePlan(tx, userId, input);
          const rows = await tx.mealCheckIn.findMany({
            where: {
              userId,
              planId: input.planId,
              dayNumber: input.dayNumber,
              localDate: new Date(`${input.localDate}T00:00:00.000Z`),
            },
          });
          const checkIns = context.meals.map((meal) => {
            const row = rows.find((r) => r.mealIndex === meal.mealIndex);
            return {
              ...meal,
              id: row?.id ?? null,
              state: row?.state ?? "PENDING",
              active: row?.state === "EATEN",
              revision: row?.revision ?? 0,
            };
          });
          const completed = checkIns.filter((r) => r.state === "EATEN").length;
          const skipped = checkIns.filter((r) => r.state === "SKIPPED").length;
          const decided = completed + skipped;
          return {
            contractVersion: 2 as const,
            source: "PLAN_CHECK_INS_ONLY" as const,
            legacyMealLogsExcluded: true,
            unplannedSupported: false,
            ...input,
            planVersion: context.planVersion,
            planDate: context.planDate,
            checkIns,
            total: checkIns.length,
            completed,
            eaten: completed,
            skipped,
            pending: checkIns.length - decided,
            decided,
            allDecided: checkIns.length > 0 && decided === checkIns.length,
            allDone: checkIns.length > 0 && completed === checkIns.length,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    },
    setState(
      userId: string,
      input: CheckInIdentity,
      state: MealCheckInState,
      expectedRevision: number,
    ) {
      return db.$transaction(
        async (tx) => {
          const context = await requirePlan(tx, userId, input);
          if (!context.meals.some((m) => m.mealIndex === input.mealIndex)) {
            throw ApiError.unprocessable("The selected plan meal does not exist on this date.");
          }
          const key = {
            userId,
            planId: input.planId,
            dayNumber: input.dayNumber,
            mealIndex: input.mealIndex,
            localDate: new Date(`${input.localDate}T00:00:00.000Z`),
          };
          const existing = await tx.mealCheckIn.findUnique({
            where: { userId_planId_dayNumber_mealIndex_localDate: key },
          });
          const revision = existing?.revision ?? 0;
          // Only the immediate successor is a replay. Older confirms cannot
          // resurrect an undo, including confirm/undo/confirm (ABA).
          if (existing && revision === expectedRevision + 1 && existing.state === state) {
            return {
              ...input,
              id: existing.id,
              state,
              active: state === "EATEN",
              revision,
              planVersion: context.planVersion,
              contractVersion: 2 as const,
            };
          }
          if (revision !== expectedRevision || revision >= 2_147_483_646) {
            throw new ApiError(
              409,
              "Meal check-in has changed. Read the current state before a new action.",
              {
                code: "MEAL_CHECK_IN_REVISION_CONFLICT",
                details: {
                  state: existing?.state ?? "PENDING",
                  active: existing?.state === "EATEN",
                  revision,
                },
              },
            );
          }
          const row = existing
            ? await tx.mealCheckIn.update({
                where: { id: existing.id },
                data: { state, revision: { increment: 1 } },
              })
            : await tx.mealCheckIn.create({ data: { ...key, state, revision: 1 } });
          return {
            ...input,
            id: row.id,
            state: row.state,
            active: row.state === "EATEN",
            revision: row.revision,
            planVersion: context.planVersion,
            contractVersion: 2 as const,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    },
  };
}
export const mealCheckInRepository = createMealCheckInRepository(prisma);
