"use client";

import type {
  NutritionPlanContent,
  NutritionPlanDeviationRecord,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { Card, CardContent } from "@/presentation/components/ui/card";

interface NutritionPlanAdherenceSummaryProps {
  content: NutritionPlanContent;
  elapsedDayNumbers: number[];
  deviations: NutritionPlanDeviationRecord[];
  loading?: boolean;
}

function cycleDayIndex(content: NutritionPlanContent, dayNumber: number): number {
  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  return mapping?.cycleIndex ?? ((dayNumber - 1) % content.cycle.length);
}

function mealCountForDay(content: NutritionPlanContent, dayNumber: number): number {
  return content.cycle[cycleDayIndex(content, dayNumber)]?.meals.length ?? 0;
}

function shiftedDayCount(content: NutritionPlanContent): number {
  return content.calendar.reduce(
    (maximum, item) => Math.max(maximum, Math.max(0, Math.trunc(item.dateOffsetDays ?? 0))),
    0,
  );
}

export function NutritionPlanAdherenceSummary({
  content,
  elapsedDayNumbers,
  deviations,
  loading = false,
}: NutritionPlanAdherenceSummaryProps) {
  const elapsedDays = new Set(elapsedDayNumbers);
  const relevant = deviations.filter((item) => elapsedDays.has(item.dayNumber));
  const deviationDays = new Set(relevant.map((item) => item.dayNumber));
  const affectedMeals = new Set<string>();

  for (const item of relevant) {
    if (item.scope === "DAY" || item.mealIndex === null) {
      const count = mealCountForDay(content, item.dayNumber);
      for (let mealIndex = 0; mealIndex < count; mealIndex += 1) {
        affectedMeals.add(`${item.dayNumber}:${mealIndex}`);
      }
      continue;
    }
    affectedMeals.add(`${item.dayNumber}:${item.mealIndex}`);
  }

  const plannedMeals = elapsedDayNumbers.reduce(
    (sum, dayNumber) => sum + mealCountForDay(content, dayNumber),
    0,
  );
  const adherence =
    plannedMeals === 0
      ? null
      : Math.max(0, Math.min(100, Math.round(((plannedMeals - affectedMeals.size) / plannedMeals) * 100)));
  const shiftedDays = shiftedDayCount(content);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Plan uyumu</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Bugüne kadar başlayan plan günlerin ve kayıtlı Kaçamakların üzerinden hesaplanır.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary tabular-nums">
            {loading ? "…" : adherence === null ? "—" : `%${adherence}`}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-lg font-bold tabular-nums">{loading ? "…" : affectedMeals.size}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">öğün Kaçamağı</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-lg font-bold tabular-nums">{loading ? "…" : deviationDays.size}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Kaçamak günü</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-lg font-bold tabular-nums">{shiftedDays}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">gün kaydırıldı</p>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Aynı öğündeki birden fazla Kaçamak, uyum yüzdesini tekrar tekrar düşürmez. Gün taşıma Kaçamak sayılmaz.
        </p>
      </CardContent>
    </Card>
  );
}
