import type { DailyHistoryResponse, ObservedNumber } from "@/domain/history/types";

export type DailyHistoryMetric = "calories" | "protein" | "water" | "activity" | "sleep" | "weight";

export const DAILY_HISTORY_METRIC_ROUTES: Record<DailyHistoryMetric, string> = {
  calories: "/meals",
  protein: "/meals",
  water: "/dashboard",
  activity: "/activity",
  sleep: "/sleep",
  weight: "/progress",
};

function hasObservedValue(value: ObservedNumber) {
  return (
    value.value !== null &&
    Number.isFinite(value.value) &&
    (value.state === "KNOWN_ZERO" ||
      value.state === "KNOWN_VALUE" ||
      value.state === "PARTIAL_VALUE")
  );
}

export function dailyHistoryMetricRoute(
  history: DailyHistoryResponse,
  metric: DailyHistoryMetric,
): string | null {
  const hasRecord =
    metric === "calories"
      ? hasObservedValue(history.nutrition.totals.calories)
      : metric === "protein"
        ? hasObservedValue(history.nutrition.totals.proteinG)
        : metric === "water"
          ? hasObservedValue(history.water.totalMl)
          : metric === "activity"
            ? hasObservedValue(history.activity.totalActiveMinutes)
            : metric === "sleep"
              ? hasObservedValue(history.sleep.totalDurationMinutes)
              : history.weight.measurement !== null;

  return hasRecord ? DAILY_HISTORY_METRIC_ROUTES[metric] : null;
}
