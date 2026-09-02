"use client";

import * as React from "react";
import { toast } from "sonner";
import { Droplets, Plus, Target } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Button } from "@/presentation/components/ui/button";
import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";
import { useMeals, computeTotals } from "@/application/meals/meals-store";
import { useNutritionPlan } from "@/application/health/nutrition-plan-store";
import {
  dailyTrackingStore,
  useDailyTracking,
  WATER_GLASS_ML,
} from "@/application/health/daily-tracking-store";

const MACROS = [
  { id: "protein" as const, label: "Protein", goalKey: "proteinGrams" as const, bar: "bg-emerald-500" },
  { id: "carbs" as const, label: "Karbonhidrat", goalKey: "carbsGrams" as const, bar: "bg-amber-500" },
  { id: "fat" as const, label: "Yağ", goalKey: "fatGrams" as const, bar: "bg-sky-500" },
] as const;

/**
 * Today's persisted nutrition/water progress. Energy and macro targets are shown
 * only when a real completed nutrition plan exists — never from hard-coded demo
 * numbers. Water uses the user's persisted onboarding/profile goal.
 */
export function TodayProgressSection() {
  const meals = useMeals();
  const { activePlan, hydrated: planHydrated } = useNutritionPlan();
  const { waterMl, waterGoalMl } = useDailyTracking();

  const totals = React.useMemo(() => computeTotals(meals), [meals]);
  const consumed = Math.round(totals.calories);
  const calorieGoal = activePlan?.dailyCalories ?? 0;
  const caloriePercent = calorieGoal > 0 ? toPercent(consumed, calorieGoal) : 0;
  const remaining = calorieGoal > 0 ? Math.max(0, calorieGoal - consumed) : null;
  const waterPercent = waterGoalMl > 0 ? toPercent(waterMl, waterGoalMl) : 0;

  const addWater = async () => {
    try {
      await dailyTrackingStore.addWater();
      toast.success("Su eklendi", { description: `+${WATER_GLASS_ML} ml` });
    } catch {
      toast.error("Su eklenemedi. Lütfen tekrar deneyin.");
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Bugünkü İlerlemen</h3>

      {/* Calories + macros */}
      <Card className="shadow-soft">
        <CardContent className="p-5">
          {!planHydrated ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Beslenme hedeflerin yükleniyor…
            </p>
          ) : !activePlan ? (
            <div className="flex items-start gap-3 rounded-xl bg-muted/40 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Target className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Kişisel beslenme hedefin henüz hazır değil</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Bugün {formatNumber(consumed)} kcal kaydettin. Kişisel planın oluşturulduğunda
                  kalori ve makro hedeflerin burada gerçek plan verileriyle gösterilecek.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex justify-center sm:shrink-0">
                <CircularProgress value={caloriePercent} size={140} strokeWidth={13}>
                  <span className="text-2xl font-bold tabular-nums">{formatNumber(consumed)}</span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    / {formatNumber(calorieGoal)} kcal
                  </span>
                  <span className="mt-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                    {formatNumber(remaining ?? 0)} kalan
                  </span>
                </CircularProgress>
              </div>

              <div className="flex-1 space-y-3">
                {MACROS.map((macro) => {
                  const value = Math.round(totals[macro.id]);
                  const goal = activePlan[macro.goalKey];
                  const percent = goal > 0 ? toPercent(value, goal) : 0;
                  return (
                    <div key={macro.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{macro.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(value)} / {formatNumber(Math.round(goal))} g
                        </span>
                      </div>
                      <ProgressBar value={percent} indicatorClassName={cn(macro.bar)} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Water */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-sky-500/10">
                <Droplets className="size-5 text-sky-500" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Su Takibi</p>
                <p className="text-xs text-muted-foreground">
                  {waterGoalMl > 0
                    ? `${formatNumber(waterMl)} / ${formatNumber(waterGoalMl)} ml`
                    : `${formatNumber(waterMl)} ml · hedef ayarlanmamış`}
                </p>
              </div>
            </div>
            {waterGoalMl > 0 && (
              <span className="text-2xl font-bold tabular-nums text-sky-500">%{waterPercent}</span>
            )}
          </div>
          {waterGoalMl > 0 && <ProgressBar value={waterPercent} indicatorClassName="bg-sky-500" />}
          <Button variant="outline" className="w-full" onClick={() => void addWater()}>
            <Plus aria-hidden="true" />
            {WATER_GLASS_ML} ml ekle
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
