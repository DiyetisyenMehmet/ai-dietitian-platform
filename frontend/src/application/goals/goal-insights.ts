import { getGoalTypeMeta, type Goal, type GoalStatus } from "@/domain/goals/types";

/**
 * Pure, dependency-free helpers that derive progress, status, estimates and
 * statistics from a Goal. All logic is local/placeholder — no backend or AI.
 */

/** Progress as a 0..100 percentage, respecting the goal's direction. */
export function computeProgress(goal: Goal): number {
  const { direction } = getGoalTypeMeta(goal.type);
  const { startValue, currentValue, targetValue } = goal;

  if (direction === "increase") {
    if (targetValue <= 0) return 0;
    return clampPercent((currentValue / targetValue) * 100);
  }

  if (direction === "decrease") {
    const total = startValue - targetValue;
    if (total <= 0) return currentValue <= targetValue ? 100 : 0;
    return clampPercent(((startValue - currentValue) / total) * 100);
  }

  // maintain: 100% when exactly on target, decaying as it drifts away.
  const tolerance = Math.max(1, targetValue * 0.05);
  const drift = Math.abs(currentValue - targetValue);
  return clampPercent(100 - (drift / tolerance) * 100);
}

/** Derives a status from progress and elapsed time between the dates. */
export function computeStatus(goal: Goal): GoalStatus {
  const progress = computeProgress(goal);
  if (progress >= 100) return "completed";

  const elapsed = timeElapsedRatio(goal.startDate, goal.targetDate);
  if (elapsed <= 0) return "on-track";

  const expected = elapsed * 100;
  if (progress >= expected + 10) return "ahead";
  if (progress < expected - 10) return "behind";
  return "on-track";
}

/** Fraction (0..1) of the goal window that has elapsed as of today. */
export function timeElapsedRatio(startDate: string, targetDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(targetDate).getTime();
  const now = Date.now();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Whole days remaining until the target date (never negative). */
export function daysRemaining(targetDate: string): number {
  const end = new Date(targetDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

/**
 * Rough completion estimate string based on the current pace.
 * Placeholder heuristic — not a real projection.
 */
export function completionEstimate(goal: Goal): string {
  const progress = computeProgress(goal);
  if (progress >= 100) return "Hedef tamamlandı 🎉";

  const remaining = daysRemaining(goal.targetDate);
  if (remaining === 0) return "Hedef tarihine ulaşıldı";

  const elapsed = timeElapsedRatio(goal.startDate, goal.targetDate);
  if (elapsed > 0 && progress > 0) {
    // Estimate days needed at the current pace.
    const paceDaysForFull = (elapsedDays(goal.startDate) / progress) * 100;
    const estDaysLeft = Math.max(0, Math.round(paceDaysForFull - elapsedDays(goal.startDate)));
    if (estDaysLeft <= remaining) return `Bu tempoyla ~${estDaysLeft} gün içinde tamamlanır`;
    return `Bu tempoyla hedef tarihinden sonra tamamlanabilir`;
  }
  return `Hedef tarihine ${remaining} gün kaldı`;
}

/** Warm, encouraging insight message tailored to status. */
export function motivationalInsight(goal: Goal): string {
  const meta = getGoalTypeMeta(goal.type);
  const status = computeStatus(goal);
  const remaining = Math.abs(goal.targetValue - goal.currentValue);

  switch (status) {
    case "completed":
      return "Harika iş çıkardın! Hedefine ulaştın, bu istikrarı korumaya devam et. 🎉";
    case "ahead":
      return `Planından öndesin, tempon çok iyi! Hedefe yaklaşık ${formatValue(remaining)} ${meta.unit} kaldı.`;
    case "behind":
      return `Biraz gerideyiz ama telafi edebilirsin. Küçük ve tutarlı adımlar büyük fark yaratır. 💪`;
    default:
      return `İyi gidiyorsun! Hedefe yaklaşık ${formatValue(remaining)} ${meta.unit} kaldı, bu tempoyu koru.`;
  }
}

/** Summary statistics rendered on the details screen. */
export interface GoalStatistics {
  progress: number;
  daysRemaining: number;
  remainingValue: number;
  bestValue: number;
  averageValue: number;
  entryCount: number;
}

export function computeStatistics(goal: Goal): GoalStatistics {
  const meta = getGoalTypeMeta(goal.type);
  const values = goal.history.map((h) => h.value);
  const best =
    values.length === 0
      ? goal.currentValue
      : meta.direction === "decrease"
        ? Math.min(...values)
        : Math.max(...values);
  const average =
    values.length === 0 ? goal.currentValue : values.reduce((a, b) => a + b, 0) / values.length;

  return {
    progress: computeProgress(goal),
    daysRemaining: daysRemaining(goal.targetDate),
    remainingValue: Math.abs(goal.targetValue - goal.currentValue),
    bestValue: best,
    averageValue: Math.round(average * 10) / 10,
    entryCount: goal.history.length,
  };
}

/** A single bar in the weekly progress chart (placeholder). */
export interface WeeklyPoint {
  label: string;
  value: number;
}

/**
 * Builds a 7-point weekly series from history (or a gentle synthetic ramp
 * toward the current value when history is sparse). Placeholder visualization.
 */
export function weeklySeries(goal: Goal): WeeklyPoint[] {
  const dayLabels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const recent = goal.history.slice(-7);

  if (recent.length >= 7) {
    return recent.map((entry, i) => ({ label: dayLabels[i] ?? "", value: entry.value }));
  }

  // Synthetic ramp from startValue -> currentValue for a pleasing placeholder.
  return dayLabels.map((label, i) => {
    const ratio = i / (dayLabels.length - 1);
    const value = goal.startValue + (goal.currentValue - goal.startValue) * ratio;
    return { label, value: Math.round(value * 10) / 10 };
  });
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function elapsedDays(startDate: string): number {
  const start = new Date(startDate).getTime();
  return Math.max(1, (Date.now() - start) / (1000 * 60 * 60 * 24));
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
