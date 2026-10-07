import {
  activeMealReminderPlan,
  buildMealReminderEntries,
  hasFutureMealReminders,
  type MealReminderEntry,
} from "../../domain/account/meal-reminder-plan";
import type { NotificationPreferences } from "../../domain/account/types";
import { nutritionPlanClient, type NutritionPlanRecord } from "../nutrition/nutrition-plan-client";
import { paymentsClient } from "../payments/payments-client";

export interface MealReminderContext {
  plan: NutritionPlanRecord | null;
  paid: boolean;
}
export class MealReminderGateError extends Error {}
interface MealBridge {
  isAvailable?: () => boolean;
  permissionStatus?: () => string;
  replaceSchedule?: (schedule: string) => number;
  cancelNutrition?: () => void;
}
function mealBridge(): MealBridge | undefined {
  if (typeof window === "undefined") return;
  return (window as unknown as { DiewishReminders?: MealBridge }).DiewishReminders;
}

/** Never call cancelAll: water, activity and sleep use another existing queue. */
export function cancelMealReminderSchedule(): void {
  try {
    mealBridge()?.cancelNutrition?.();
  } catch {
    /* Optional older bridge. */
  }
}

export function syncMealReminderEntries(
  input: {
    enabled: boolean;
    paid: boolean;
    completed: boolean;
    entries: MealReminderEntry[];
  },
  now = Date.now(),
): void {
  try {
    const bridge = mealBridge();
    if (!bridge?.isAvailable?.()) return;
    if (
      !input.enabled ||
      !input.paid ||
      input.completed ||
      bridge.permissionStatus?.() !== "granted"
    ) {
      cancelMealReminderSchedule();
      return;
    }
    const entries = input.entries
      .filter((entry) => Number.isFinite(entry.at) && entry.at > now)
      .sort((a, b) => a.at - b.at)
      .slice(0, 240)
      .map((entry) => ({ id: entry.id.slice(0, 96), at: entry.at }));
    bridge.replaceSchedule?.(JSON.stringify(entries));
  } catch {
    /* A device failure cannot undo persisted account preferences. */
  }
}

export async function loadMealReminderContext(): Promise<MealReminderContext> {
  const [{ plans }, subscription] = await Promise.all([
    nutritionPlanClient.list(),
    paymentsClient.getSubscription(),
  ]);
  return {
    plan: activeMealReminderPlan(plans),
    paid: subscription.tier === "PREMIUM" || subscription.tier === "PREMIUM_PLUS",
  };
}

export function mealReminderGate(context: MealReminderContext): string | null {
  if (!context.paid)
    return "Öğün hatırlatmaları Premium ve Premium Plus aboneliklerinde kullanılabilir.";
  if (!context.plan)
    return "Önce aktif bir öğün planı oluştur. Hatırlatma saatleri bu plandan alınır.";
  if (!hasFutureMealReminders(context.plan))
    return "Bu planda gelecek öğün saati kalmadı. Öğün planını kontrol edebilirsin.";
  return null;
}

export function syncMealReminderPreference(
  preferences: NotificationPreferences,
  context?: MealReminderContext,
): void {
  if (!preferences.mealReminders) {
    cancelMealReminderSchedule();
    return;
  }
  if (!context) return;
  syncMealReminderEntries({
    enabled: true,
    paid: context.paid,
    completed: !hasFutureMealReminders(context.plan),
    entries: context.plan ? buildMealReminderEntries(context.plan) : [],
  });
}
