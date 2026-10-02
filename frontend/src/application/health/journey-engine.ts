import type { DailyTask, JourneyStep, JourneyStepKind } from "../../domain/health/types";

export type GoalDirection = "lose" | "gain" | "maintain";
export type Sufficiency = "UNKNOWN" | "KNOWN_ZERO" | "KNOWN";
export type MealKind = "breakfast" | "lunch" | "dinner" | "snack";
export interface JourneyInput {
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
    });
  }
  const regular = input.workScheduleType === "REGULAR";
  for (const [kind, label, icon, end] of [
    ["breakfast", "Kahvaltı", "sunrise", 12],
    ["lunch", "Öğle yemeği", "sun", 17],
    ["dinner", "Akşam yemeği", "moon", 23],
  ] as const) {
    if (data[kind] === "UNKNOWN") continue;
    const completed = input.meals[kind]! > 0;
    steps.push({
      kind,
      label,
      icon,
      href: `/meals/add?slot=${kind}`,
      hint: completed ? "Öğün kaydedildi" : `${label} kaydı henüz yok. ${goalReason}`,
      // A passed recording window does not imply the person skipped eating.
      state: completed ? "completed" : regular && input.localHour >= end ? "skipped" : "pending",
    });
  }
  if (
    data.water !== "UNKNOWN" &&
    input.waterGoalMl != null &&
    Number.isFinite(input.waterGoalMl) &&
    input.waterGoalMl > 0
  ) {
    steps.push({
      kind: "water",
      label: "Su",
      icon: "droplet",
      hint: `${input.waterMl} / ${input.waterGoalMl} ml su kaydı`,
      progress: Math.min(1, input.waterMl! / input.waterGoalMl),
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
      state: "completed",
    });
  }
  // Optional snacks are acknowledged, never prescribed as an obligation.
  if (data.snack === "KNOWN")
    steps.push({
      kind: "snack",
      label: "Ara öğün",
      icon: "utensils",
      href: "/meals/add?slot=snack",
      hint: "Ara öğün kaydedildi",
      state: "completed",
    });
  const next = steps.find((step) => step.state === "pending" && Boolean(step.href));
  if (next) next.state = "recommended";
  const insufficient =
    [data.breakfast, data.lunch, data.dinner, data.water, data.weight].includes("UNKNOWN") ||
    !input.waterGoalMl ||
    input.waterGoalMl <= 0 ||
    !Number.isFinite(input.waterGoalMl);
  return {
    direction,
    steps,
    sufficiency: data,
    nextBestAction: next ? { kind: next.kind, reason: next.hint, href: next.href! } : null,
    status: next
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
    if (step.kind === "snack" || step.kind === "activity" || step.kind === "coach") return [];
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
