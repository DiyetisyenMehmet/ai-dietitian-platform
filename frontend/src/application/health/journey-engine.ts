import type { DailyTask, JourneyStep, JourneyStepKind } from "../../domain/health/types";

export type GoalDirection = "lose" | "gain" | "maintain";
export type Sufficiency = "UNKNOWN" | "KNOWN_ZERO" | "KNOWN";
export type MealKind = "breakfast" | "lunch" | "dinner" | "snack";
import type { JourneyPlannedMeal } from "./journey-plan";

export interface JourneyInput {
  plannedMeals?: JourneyPlannedMeal[];
  nowMs?: number;
  foodCounts?: Partial<Record<MealKind, number>>;
  localHour: number;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  meals: Partial<Record<MealKind, number | null>>;
  waterMl: number | null;
  waterGoalMl: number | null;
  activityMinutes: number | null;
  /** Observed daily sleep only; no sleep target or prescription is inferred. */
  sleepMinutes?: number | null;
  /** Derived only from the authoritative check-in response, never a synthetic baseline. */
  weight: { due: boolean; recordedToday: boolean } | null;
  workScheduleType?: "REGULAR" | "VARIABLE_SHIFT" | "NIGHT_SHIFT" | null;
}
export interface JourneyResult {
  direction: GoalDirection | null;
  plannedMeal: JourneyPlannedMeal | null;
  steps: JourneyStep[];
  nextBestAction: { kind: JourneyStepKind; reason: string; href: string } | null;
  sufficiency: Record<MealKind | "water" | "activity" | "sleep" | "weight", Sufficiency>;
  status: "actionable" | "all-done" | "insufficient-data" | "no-actionable-step";
}
export function deriveGoalDirection(
  start: number | null,
  target: number | null,
): GoalDirection | null {
  if (
    !start ||
    !target ||
    !Number.isFinite(start) ||
    !Number.isFinite(target) ||
    start <= 0 ||
    target <= 0
  )
    return null;
  return target < start ? "lose" : target > start ? "gain" : "maintain";
}
export function sufficiency(value: number | null | undefined): Sufficiency {
  return value == null || !Number.isFinite(value) || value < 0
    ? "UNKNOWN"
    : value === 0
      ? "KNOWN_ZERO"
      : "KNOWN";
}
const goalReasons = {
  lose: "Kilo verme hedefini düzenli kayıtlarla takip et",
  gain: "Kilo alma hedefini düzenli kayıtlarla takip et",
  maintain: "Kilonu koruma hedefini düzenli kayıtlarla takip et",
};

/** Pure recording guidance: no calorie adaptation, pace prediction or medical advice. */
export function buildJourney(input: JourneyInput): JourneyResult {
  const direction = deriveGoalDirection(input.startWeightKg, input.targetWeightKg);
  const goalReason = direction ? goalReasons[direction] : "Düzenli kayıtlarla hedefini takip et";
  const data: JourneyResult["sufficiency"] = {
    breakfast: sufficiency(input.meals.breakfast),
    lunch: sufficiency(input.meals.lunch),
    dinner: sufficiency(input.meals.dinner),
    snack: sufficiency(input.meals.snack),
    water: sufficiency(input.waterMl),
    activity: sufficiency(input.activityMinutes),
    sleep: sufficiency(input.sleepMinutes),
    weight: input.weight ? "KNOWN" : "UNKNOWN",
  };
  const steps: JourneyStep[] = [];
  if (input.weight && (input.weight.due || input.weight.recordedToday)) {
    steps.push({
      kind: "weight",
      label: "Kilo ölçümü",
      icon: "scale",
      href: "/progress",
      hint: input.weight.recordedToday ? "Bugün kaydettin" : `Haftalık ölçüm zamanı. ${goalReason}`,
      state: input.weight.recordedToday ? "completed" : "pending",
      countsTowardProgress: false,
    });
  }

  const planned = input.plannedMeals ?? [];
  if (planned.length) {
    for (const entry of planned) {
      const completed = Boolean(entry.slot && data[entry.slot] === "KNOWN");
      steps.push({
        id: entry.key,
        kind: entry.slot ?? "planned-meal",
        label: entry.meal.name,
        icon: "utensils",
        href: entry.slot ? `/meals/add?slot=${entry.slot}` : "/meals",
        hint: completed
          ? entry.slot && (input.foodCounts?.[entry.slot] ?? 0) > 0
            ? "Besin kaydı var"
            : "Öğün işaretlendi; besin kaydı yok"
          : `Planlanan ${entry.meal.time} · ${goalReason}`,
        state: completed ? "completed" : "pending",
      });
    }
  } else {
    for (const [kind, label, icon] of [
      ["breakfast", "Kahvaltı", "sunrise"],
      ["lunch", "Öğle yemeği", "sun"],
      ["dinner", "Akşam yemeği", "moon"],
    ] as const) {
      if (
        data[kind] === "UNKNOWN" &&
        data.water === "UNKNOWN" &&
        [data.breakfast, data.lunch, data.dinner].every((value) => value === "UNKNOWN")
      )
        continue;
      steps.push({
        kind,
        label,
        icon,
        href: `/meals/add?slot=${kind}`,
        hint:
          input.meals[kind]! > 0
            ? (input.foodCounts?.[kind] ?? 0) > 0
              ? "Besin kaydı var"
              : "Öğün işaretlendi; besin kaydı yok"
            : `${label} kaydı henüz yok. ${goalReason}`,
        state: input.meals[kind]! > 0 ? "completed" : "pending",
      });
    }
  }
  if (
    (data.water !== "UNKNOWN" || steps.some((step) => step.countsTowardProgress !== false)) &&
    input.waterGoalMl != null &&
    Number.isFinite(input.waterGoalMl) &&
    input.waterGoalMl > 0
  ) {
    steps.push({
      kind: "water",
      label: "Su",
      icon: "droplet",
      hint:
        data.water === "UNKNOWN"
          ? "Su kayıtları doğrulanıyor"
          : `${input.waterMl} / ${input.waterGoalMl} ml su kaydı`,
      progress:
        data.water === "UNKNOWN" ? undefined : Math.min(1, input.waterMl! / input.waterGoalMl),
      state: input.waterMl! >= input.waterGoalMl ? "completed" : "pending",
    });
  }
  // Manual logs establish recorded activity, not total movement or a prescribed target.
  if (data.activity === "KNOWN") {
    steps.push({
      kind: "activity",
      label: "Aktivite",
      icon: "activity",
      href: "/activity",
      hint: `${input.activityMinutes} dakika aktivite kaydedildi`,
      countsTowardProgress: false,
      state: "completed",
    });
  }
  // Optional snacks are acknowledged, never prescribed as an obligation.
  if (!planned.length && data.snack === "KNOWN")
    steps.push({
      kind: "snack",
      label: "Ara öğün",
      icon: "utensils",
      href: "/meals/add?slot=snack",
      hint: "İsteğe bağlı ara öğün kaydedildi",
      countsTowardProgress: false,
      state: "completed",
    });
  // Earliest unfinished planned meal wins, including snacks. Never skip an
  // unfinished meal merely because a later meal's clock time has elapsed.
  const plannedMeal = planned.find((entry) => !entry.slot || data[entry.slot] !== "KNOWN") ?? null;
  // The same engine owns the next action; elapsed time never marks a meal skipped.
  const pending = (kind: JourneyStepKind) =>
    steps.find((step) => step.kind === kind && step.state === "pending");
  const regularKind =
    input.localHour < 12 ? "breakfast" : input.localHour < 17 ? "lunch" : "dinner";
  const next =
    pending("weight") ??
    (plannedMeal
      ? steps.find((step) => step.id === plannedMeal.key && step.state === "pending")
      : undefined) ??
    (input.workScheduleType === "REGULAR" ? pending(regularKind) : undefined) ??
    steps.find((step) => step.state === "pending" && Boolean(step.href));
  if (next) next.state = "recommended";
  const insufficient =
    (planned.length
      ? planned.some((entry) => !entry.slot || data[entry.slot] === "UNKNOWN")
      : [data.breakfast, data.lunch, data.dinner].includes("UNKNOWN")) ||
    data.water === "UNKNOWN" ||
    !input.waterGoalMl ||
    input.waterGoalMl <= 0 ||
    !Number.isFinite(input.waterGoalMl);
  const required = steps.filter((step) => step.countsTowardProgress !== false);
  const complete =
    !insufficient && required.length > 0 && required.every((step) => step.state === "completed");
  return {
    direction,
    plannedMeal,
    steps,
    sufficiency: data,
    nextBestAction:
      next && !complete ? { kind: next.kind, reason: next.hint, href: next.href! } : null,
    status: complete
      ? "all-done"
      : next
        ? "actionable"
        : insufficient
          ? "insufficient-data"
          : steps.some((s) => s.state !== "completed")
            ? "no-actionable-step"
            : "all-done",
  };
}

/** Legacy task shape, derived without making a second set of decisions. */
export function journeyTasks(result: JourneyResult): DailyTask[] {
  return result.steps.flatMap((step) => {
    if (
      step.kind === "planned-meal" ||
      step.kind === "snack" ||
      step.kind === "activity" ||
      step.kind === "coach"
    )
      return [];
    return [
      {
        id: `task-${step.kind}`,
        kind: step.kind,
        label: {
          breakfast: "Kahvaltını ekle",
          lunch: "Öğle yemeğini tamamla",
          dinner: "Akşam yemeğini ekle",
          water: "Su hedefine ulaş",
          weight: step.state === "completed" ? "Kilonu kaydettin" : "Kilonu kaydet",
        }[step.kind],
        done: step.state === "completed",
        icon: step.icon,
        href: step.href,
      },
    ];
  });
}
