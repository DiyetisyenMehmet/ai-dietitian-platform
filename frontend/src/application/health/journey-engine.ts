import type { DailyTask, JourneyStep, JourneyStepKind } from "../../domain/health/types";

export type GoalDirection = "lose" | "gain" | "maintain";
export type Sufficiency = "UNKNOWN" | "KNOWN_ZERO" | "KNOWN";
export type MealKind = "breakfast" | "lunch" | "dinner" | "snack";
import type { JourneyPlannedMeal } from "./journey-plan";
import type { PlanMealDecisions } from "./plan-meal-decisions";

export interface JourneyInput {
  plannedMeals?: JourneyPlannedMeal[];
  /** When supplied, v2 is the sole authority for planned decisions. Null means unknown. */
  planDecisions?: PlanMealDecisions | null;
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
  plannedMeals: JourneyPlannedMeal[];
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
  const exactDecisions = input.planDecisions !== undefined;
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

  const ordered = [...(input.plannedMeals ?? [])].sort((a, b) => a.at - b.at);
  // Display-only grace around the scheduled time; never a skipped/eaten rule.
  const currentMealLabelMs = 60 * 60 * 1000;
  const planned = ordered.map(
    (entry, index): JourneyPlannedMeal => ({
      ...entry,
      timing: !Number.isFinite(input.nowMs)
        ? undefined
        : entry.at > input.nowMs!
          ? "upcoming"
          : (ordered[index + 1] && ordered[index + 1].at <= input.nowMs!) ||
              input.nowMs! - entry.at > currentMealLabelMs
            ? "earlier"
            : "now",
    }),
  );
  if (planned.length) {
    for (const entry of planned) {
      const decision = input.planDecisions?.[entry.key];
      const completed = exactDecisions
        ? Boolean(decision && decision.state !== "PENDING")
        : Boolean(entry.slot && data[entry.slot] === "KNOWN");
      steps.push({
        id: entry.key,
        kind: entry.slot ?? "planned-meal",
        label: entry.meal.name,
        icon: "utensils",
        href: entry.slot ? `/meals/add?slot=${entry.slot}` : "/meals/plan",
        hint: exactDecisions
          ? !decision ? "Öğün kararı doğrulanıyor"
            : decision.state === "SKIPPED" ? "Yemedim · Besin ve kalori eklenmedi"
              : decision.state === "EATEN" ? "Yedim · Besin kaydı ayrı tutulur"
                : `Planlanan ${entry.meal.time} · Karar verilmedi`
          : completed
          ? entry.slot && (input.foodCounts?.[entry.slot] ?? 0) > 0
            ? "Besin kaydı var"
            : "Öğün işaretlendi; besin kaydı yok"
          : entry.slot
            ? `Planlanan ${entry.meal.time} · ${goalReason}`
            : `Planlanan ${entry.meal.time} · Tekil kayıtla eşleşmiyor; takip hedeflerine dahil değil.`,
        state: completed ? "completed" : "pending",
        countsTowardProgress: exactDecisions || Boolean(entry.slot),
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
    (data.water !== "UNKNOWN" ||
      planned.length > 0 ||
      steps.some((step) => step.countsTowardProgress !== false)) &&
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
          : input.waterMl! >= input.waterGoalMl
            ? `Su hedefin tamamlandı (${input.waterMl}/${input.waterGoalMl} ml)`
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
  // Prefer the scheduled current/next meal. Earlier unconfirmed meals remain
  // pending in the timeline; elapsed time is never a skipped/eaten decision.
  const unfinished = planned.filter((entry) => exactDecisions
    ? !input.planDecisions?.[entry.key] || input.planDecisions[entry.key].state === "PENDING"
    : !entry.slot || data[entry.slot] !== "KNOWN");
  const trackable = unfinished.filter((entry) => exactDecisions || entry.slot);
  const clockKnown = Number.isFinite(input.nowMs);
  const candidates = clockKnown ? unfinished : trackable;
  const plannedMeal =
    candidates.find((entry) => entry.timing === "now") ??
    candidates.find((entry) => entry.timing === "upcoming") ??
    [...trackable].reverse().find((entry) => entry.timing === "earlier") ??
    (!clockKnown ? trackable[0] : null) ??
    null;
  // The same engine owns the next action; elapsed time never marks a meal skipped.
  const pending = (kind: JourneyStepKind) =>
    steps.find((step) => step.kind === kind && step.state === "pending");
  const regularKind =
    input.localHour < 12 ? "breakfast" : input.localHour < 17 ? "lunch" : "dinner";
  const next =
    (plannedMeal
      ? steps.find((step) => step.id === plannedMeal.key && step.state === "pending")
      : undefined) ??
    pending("weight") ??
    (input.workScheduleType === "REGULAR" ? pending(regularKind) : undefined) ??
    steps.find(
      (step) =>
        step.countsTowardProgress !== false && step.state === "pending" && Boolean(step.href),
    );
  const insufficient =
    (planned.length
      ? exactDecisions
        ? planned.some((entry) => !input.planDecisions?.[entry.key])
        : planned.some((entry) => entry.slot && data[entry.slot] === "UNKNOWN")
      : [data.breakfast, data.lunch, data.dinner].includes("UNKNOWN")) ||
    data.water === "UNKNOWN" ||
    !input.waterGoalMl ||
    input.waterGoalMl <= 0 ||
    !Number.isFinite(input.waterGoalMl);
  const required = steps.filter((step) => step.countsTowardProgress !== false);
  const complete =
    !insufficient && required.length > 0 && required.every((step) => step.state === "completed");
  if (next && !complete) next.state = "recommended";
  return {
    direction,
    plannedMeal: complete ? null : plannedMeal,
    plannedMeals: planned,
    steps,
    sufficiency: data,
    nextBestAction:
      next && !complete ? { kind: next.kind, reason: next.hint, href: next.href! } : null,
    // Completion covers trackable recording targets, never unmatched plan rows.
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
