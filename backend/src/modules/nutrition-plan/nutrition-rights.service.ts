import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../utils/api-error";
import { readEffectiveSubscriptionState } from "../payments/subscription-state";
import { BILLING_PERIOD_DAYS } from "../payments/constants";
import {
  freeAvailableAt,
  nutritionLimits,
  subscriptionMonth,
  turkeyDay,
} from "./nutrition-rights-policy";

export type NutritionRightKind = "NEW_PLAN" | "MEAL_CHANGE";
export interface NutritionRightsStatus {
  tier: "FREE" | "PREMIUM" | "PREMIUM_PLUS";
  dayRemaining: number | null;
  monthRemaining: number | null;
  freeRemaining: number | null;
  available: boolean;
  resetsAt: string | null;
  grandfathered: boolean;
}

export function requireNutritionJobs(): void {
  if (
    !env.NUTRITION_JOBS_ENABLED ||
    !env.NUTRITION_RIGHTS_EFFECTIVE_AT ||
    env.DIEWISH_ENVIRONMENT === "production" ||
    (!env.DIEWISH_ENVIRONMENT && env.NODE_ENV === "production")
  ) {
    throw new ApiError(404, "Resumable nutrition is not enabled.", {
      code: "NUTRITION_JOBS_DISABLED",
    });
  }
}

/** Side-effect-free access projection. Never edits subscription/provider rows. */
export async function nutritionRights(
  userId: string,
  kind: NutritionRightKind,
  tx: Prisma.TransactionClient = prisma,
  originPlanId?: string,
  dayNumber?: number,
  now = new Date(),
): Promise<NutritionRightsStatus> {
  const state = await readEffectiveSubscriptionState(userId);
  if (!state) throw ApiError.notFound("User not found.");
  const tier = state.tier;
  const effectiveAt = new Date(env.NUTRITION_RIGHTS_EFFECTIVE_AT!);
  const base = {
    tier,
    grandfathered: false,
    dayRemaining: null,
    monthRemaining: null,
    freeRemaining: null,
    available: true,
    resetsAt: null,
  } as NutritionRightsStatus;
  if (tier === "FREE") {
    if (kind === "MEAL_CHANGE") {
      if (!originPlanId || !dayNumber) throw ApiError.badRequest("A plan day is required.");
      const used = await tx.nutritionRightsEvent.count({
        where: { userId, kind, originPlanId, dayNumber },
      });
      return { ...base, freeRemaining: Math.max(0, 1 - used), available: used === 0 };
    }
    const [last, legacy] = await Promise.all([
      tx.nutritionRightsEvent.findFirst({
        where: { userId, kind },
        orderBy: { createdAt: "desc" },
      }),
      // Prior successful usage is retained; abandoned generations have no event.
      tx.aiUsageEvent.findFirst({
        where: { userId, feature: "NUTRITION_PLAN", createdAt: { lt: effectiveAt } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const latest =
      [last?.createdAt, legacy?.createdAt]
        .filter((date): date is Date => !!date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const availableAt = freeAvailableAt(latest);
    return {
      ...base,
      freeRemaining: !availableAt || availableAt <= now ? 1 : 0,
      available: !availableAt || availableAt <= now,
      resetsAt: availableAt?.toISOString() ?? null,
    };
  }
  const source =
    state.source === "GOOGLE_PLAY"
      ? state.googlePlay
      : state.source === "ADMIN_SUPPORT"
        ? state.supportEntitlement
        : state.subscription;
  const anchor =
    state.source === "GOOGLE_PLAY"
      ? state.googlePlay?.startedAt
      : state.source === "ADMIN_SUPPORT"
        ? state.supportEntitlement?.grantedAt
        : state.subscription?.currentPeriodStart;
  const grandfathered = kind === "NEW_PLAN" && !!source && source.createdAt < effectiveAt;
  if (!source || (!grandfathered && !anchor))
    throw new ApiError(409, "Subscription period needs verification.", {
      code: "NUTRITION_PERIOD_UNVERIFIED",
    });
  // Retain the original UTC/calendar windows as well as sold plan allowances.
  // Existing iyzico checkout records use an explicit 30-day billing period,
  // which is not always a calendar month. Use that verified period verbatim.
  const periodEnd = state.source === "IYZICO" ? state.subscription?.currentPeriodEnd : null;
  const monthlyBillingPeriod =
    anchor &&
    periodEnd &&
    periodEnd.getTime() - anchor.getTime() === BILLING_PERIOD_DAYS * 86_400_000;
  const month = grandfathered
    ? {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      }
    : monthlyBillingPeriod
      ? { start: anchor!, end: periodEnd! }
      : subscriptionMonth(anchor!, now);
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = grandfathered
    ? { start: utcStart, end: new Date(utcStart.getTime() + 86_400_000) }
    : turkeyDay(now);
  const limits = nutritionLimits(tier, grandfathered);
  const counts = async (start: Date, end: Date) => {
    const current = await tx.nutritionRightsEvent.count({
      where: { userId, kind, createdAt: { gte: start, lt: end } },
    });
    const legacy =
      kind === "NEW_PLAN" && start < effectiveAt
        ? await tx.aiUsageEvent.count({
            where: {
              userId,
              feature: "NUTRITION_PLAN",
              createdAt: { gte: start, lt: end < effectiveAt ? end : effectiveAt },
            },
          })
        : 0;
    return current + legacy;
  };
  const [dayUsed, monthUsed] = await Promise.all([
    counts(day.start, day.end),
    counts(month.start, month.end),
  ]);
  const dayRemaining = Math.max(0, limits.day! - dayUsed),
    monthRemaining = Math.max(0, limits.month! - monthUsed);
  return {
    ...base,
    grandfathered,
    dayRemaining,
    monthRemaining,
    available: dayRemaining > 0 && monthRemaining > 0,
    resetsAt: (dayRemaining === 0 ? day.end : month.end).toISOString(),
  };
}

export function assertNutritionRight(status: NutritionRightsStatus): void {
  if (!status.available)
    throw new ApiError(429, "Beslenme işlemi kullanım hakkına ulaştın.", {
      code: "NUTRITION_RIGHT_EXHAUSTED",
      details: { resetsAt: status.resetsAt, tier: status.tier },
    });
}
