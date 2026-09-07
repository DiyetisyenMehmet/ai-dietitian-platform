import { prisma } from "../../lib/prisma";
import type { NutritionPlanContent, WorkScheduleType } from "./types";
import {
  allowsWallClockHungerAdaptation,
  workScheduleBehaviorInsight,
} from "./work-schedule-policy";

const LOOKBACK_DAYS = 30;
const MIN_RECURRING_HUNGER_EVENTS = 3;
const MIN_RECURRING_HUNGER_DAYS = 3;
const HUNGER_BUCKET_MINUTES = 120;

export interface NutritionAdaptationProfile {
  preferredSnackTime: string | null;
  behaviorInsights: string[];
  evidence: {
    hungerEvents: number;
    acceptedAdaptiveSnacks: number;
    uniqueDeviations: number;
    shiftedDays: number;
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minutes: number): string {
  const normalized = ((Math.round(minutes / 5) * 5) % 1440 + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function recurringHungerWindow(
  memories: Array<{ content: unknown }>,
): { preferredSnackTime: string; count: number; days: number } | null {
  const buckets = new Map<number, Array<{ minute: number; localDate: string }>>();

  for (const memory of memories) {
    const content = objectValue(memory.content);
    if (content?.kind !== "HUNGER_EVENT") continue;
    if (content.hungerLevel !== "HUNGRY" && content.hungerLevel !== "VERY_HUNGRY") continue;
    const minute = parseClock(content.localTime);
    const localDate = typeof content.localDate === "string" ? content.localDate : "";
    if (minute === null || !localDate) continue;
    const bucket = Math.floor(minute / HUNGER_BUCKET_MINUTES);
    const entries = buckets.get(bucket) ?? [];
    entries.push({ minute, localDate });
    buckets.set(bucket, entries);
  }

  let best: Array<{ minute: number; localDate: string }> | null = null;
  for (const entries of buckets.values()) {
    const days = new Set(entries.map((entry) => entry.localDate)).size;
    if (
      entries.length >= MIN_RECURRING_HUNGER_EVENTS &&
      days >= MIN_RECURRING_HUNGER_DAYS &&
      (!best || entries.length > best.length)
    ) {
      best = entries;
    }
  }
  if (!best) return null;

  return {
    preferredSnackTime: formatClock(median(best.map((entry) => entry.minute))),
    count: best.length,
    days: new Set(best.map((entry) => entry.localDate)).size,
  };
}

function uniqueDeviationKey(item: {
  createdAt: Date;
  dayNumber: number;
  mealIndex: number | null;
  foodIndex: number | null;
  scope: string;
  type: string;
  plannedItemName: string | null;
}): string {
  // Revision copies preserve createdAt and planned context, so this collapses
  // copied historical records instead of treating them as new user behavior.
  return [
    item.createdAt.toISOString(),
    item.dayNumber,
    item.mealIndex ?? "-",
    item.foodIndex ?? "-",
    item.scope,
    item.type,
    item.plannedItemName ?? "",
  ].join("|");
}

function shiftedDaysFromContent(value: unknown): number {
  const content = value as Partial<NutritionPlanContent> | null;
  if (!content || !Array.isArray(content.calendar)) return 0;
  return content.calendar.reduce(
    (max, item) => Math.max(max, Math.max(0, Math.trunc(item?.dateOffsetDays ?? 0))),
    0,
  );
}

/**
 * Builds a bounded, deterministic behavior profile from nutrition-relevant
 * signals only. One-off behavior never changes timing: recurring hunger requires
 * evidence on at least three distinct days in the same two-hour window. Variable
 * shift schedules deliberately disable fixed wall-clock hunger learning because
 * the same clock time can represent different biological points across shifts.
 */
export const nutritionPlanAdaptationService = {
  async build(userId: string): Promise<NutritionAdaptationProfile> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const [memories, rawDeviations, activePlan, profile] = await Promise.all([
      prisma.aiMemory.findMany({
        where: { userId, memoryType: "MEAL_HABITS", createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { content: true },
      }),
      prisma.nutritionPlanDeviation.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          dayNumber: true,
          mealIndex: true,
          foodIndex: true,
          scope: true,
          type: true,
          plannedItemName: true,
        },
      }),
      prisma.nutritionPlan.findFirst({
        where: { userId, isActive: true, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { dailyPlans: true },
      }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: { workScheduleType: true },
      }),
    ]);

    const workScheduleType = (profile?.workScheduleType ?? null) as WorkScheduleType | null;
    const hungerEvents = memories.filter(
      (memory) => objectValue(memory.content)?.kind === "HUNGER_EVENT",
    );
    const acceptedAdaptiveSnacks = memories.filter(
      (memory) => objectValue(memory.content)?.kind === "ADDED_SNACK",
    ).length;

    const deviations = [
      ...new Map(rawDeviations.map((item) => [uniqueDeviationKey(item), item] as const)).values(),
    ];
    const shiftedDays = shiftedDaysFromContent(activePlan?.dailyPlans);
    const recurring = allowsWallClockHungerAdaptation(workScheduleType)
      ? recurringHungerWindow(hungerEvents)
      : null;
    const behaviorInsights: string[] = [];
    const scheduleInsight = workScheduleBehaviorInsight(workScheduleType);
    if (scheduleInsight) behaviorInsights.push(scheduleInsight);

    if (recurring) {
      behaviorInsights.push(
        `Son 30 günde ${recurring.days} farklı günde tekrarlayan belirgin açlık yaklaşık ${recurring.preferredSnackTime} civarında görüldü; güvenli öğün aralıkları içinde ara öğün zamanlamasını bu pencereye yaklaştır.`,
      );
    }

    if (acceptedAdaptiveSnacks >= 2) {
      behaviorInsights.push(
        `Kullanıcı son 30 günde ${acceptedAdaptiveSnacks} uyarlanmış ara öğünü gerçekten tüketti; günlük hedeflerin içinde pratik ve planlı küçük ara öğün seçeneklerini koru.`,
      );
    }

    const skippedMeals = deviations.filter(
      (item) => item.scope === "MEAL" && item.type === "SKIPPED" && item.mealIndex !== null,
    );
    const skippedBySlot = new Map<number, typeof skippedMeals>();
    for (const item of skippedMeals) {
      const index = item.mealIndex as number;
      const entries = skippedBySlot.get(index) ?? [];
      entries.push(item);
      skippedBySlot.set(index, entries);
    }
    const repeatedSkipped = [...skippedBySlot.entries()]
      .filter(([, items]) => items.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)[0];
    if (repeatedSkipped) {
      const [, items] = repeatedSkipped;
      const label = items.find((item) => item.plannedItemName)?.plannedItemName ?? "aynı öğün";
      behaviorInsights.push(
        `${label} son 30 günde ${items.length} kez tamamen atlandı; bu öğünde daha uygulanabilir, taşınabilir ve hazırlaması kolay seçenekleri tercih et.`,
      );
    }

    const replacements = deviations.filter((item) => item.type === "REPLACED").length;
    if (replacements >= 3) {
      behaviorInsights.push(
        `Planlı besin/öğünler son 30 günde ${replacements} kez değiştirildi; benzer besin değerini koruyan daha erişilebilir alternatifler seç.`,
      );
    }

    const portionChanges = deviations.filter((item) => item.type === "PORTION_CHANGED").length;
    if (portionChanges >= 3) {
      behaviorInsights.push(
        `Porsiyonlar son 30 günde ${portionChanges} kez değiştirildi; porsiyonları günlük hedefleri bozmadan daha gerçekçi ve kolay ölçülebilir biçimde sun.`,
      );
    }

    const extras = deviations.filter((item) => item.type === "EXTRA").length;
    if (extras >= 2) {
      behaviorInsights.push(
        `Plan dışı tüketim son 30 günde ${extras} kez bildirildi; ana öğünlerde tokluk ve uygulanabilirliği artıran besin seçimlerini önceliklendir, ancak kalori/makro hedeflerini değiştirme.`,
      );
    }

    if (shiftedDays >= 2) {
      behaviorInsights.push(
        `Aktif plan takvimi ${shiftedDays} gün kaydırıldı; program değişikliklerine dayanıklı, esnek ve pratik öğünler tercih et.`,
      );
    }

    return {
      preferredSnackTime: recurring?.preferredSnackTime ?? null,
      behaviorInsights: behaviorInsights.slice(0, 6),
      evidence: {
        hungerEvents: hungerEvents.length,
        acceptedAdaptiveSnacks,
        uniqueDeviations: deviations.length,
        shiftedDays,
      },
    };
  },
};
