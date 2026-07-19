"use client";

import * as React from "react";
import { toast } from "sonner";
import { Droplets, Plus } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Button } from "@/presentation/components/ui/button";
import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";
import { useMeals, computeTotals } from "@/application/meals/meals-store";
import { useHealthProfile } from "@/application/health/health-profile-store";
import {
  dailyTrackingStore,
  useDailyTracking,
  WATER_GLASS_ML,
} from "@/application/health/daily-tracking-store";

/** Macro goals (grams). Placeholder targets consistent with the earlier dashboard. */
const MACRO_GOALS = { protein: 120, carbs: 260, fat: 70 } as const;

const MACROS: readonly { id: keyof typeof MACRO_GOALS; label: string; bar: string }[] = [
  { id: "protein", label: "Protein", bar: "bg-emerald-500" },
  { id: "carbs", label: "Karbonhidrat", bar: "bg-amber-500" },
  { id: "fat", label: "Yağ", bar: "bg-sky-500" },
];

/** Compact "Today's Progress" — calories ring, macros and water in two cards. */
export function TodayProgressSection() {
  const meals = useMeals();
  const profile = useHealthProfile();
  const { waterMl, waterGoalMl } = useDailyTracking();

  const totals = React.useMemo(() => computeTotals(meals), [meals]);
  const calorieGoal = profile.dailyCalorieGoal;
  const consumed = Math.round(totals.calories);
  const caloriePercent = toPercent(consumed, calorieGoal);
  const remaining = Math.max(0, calorieGoal - consumed);
  const waterPercent = toPercent(waterMl, waterGoalMl);

  const addWater = () => {
    dailyTrackingStore.addWater();
    toast.success("Su eklendi", { description: `+${WATER_GLASS_ML} ml` });
  };

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Bugünkü İlerlemen</h3>

      {/* Calories + macros */}
      <Card className="shadow-soft">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="flex justify-center sm:shrink-0">
            <CircularProgress value={caloriePercent} size={140} strokeWidth={13}>
              <span className="text-2xl font-bold tabular-nums">{formatNumber(consumed)}</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                / {formatNumber(calorieGoal)} kcal
              </span>
              <span className="mt-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                {formatNumber(remaining)} kalan
              </span>
            </CircularProgress>
          </div>

          <div className="flex-1 space-y-3">
            {MACROS.map((macro) => {
              const value = Math.round(totals[macro.id]);
              const goal = MACRO_GOALS[macro.id];
              const percent = toPercent(value, goal);
              return (
                <div key={macro.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{macro.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(value)} / {formatNumber(goal)} g
                    </span>
                  </div>
                  <ProgressBar value={percent} indicatorClassName={cn(macro.bar)} />
                </div>
              );
            })}
          </div>
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
                  {formatNumber(waterMl)} / {formatNumber(waterGoalMl)} ml
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold tabular-nums text-sky-500">%{waterPercent}</span>
          </div>
          <ProgressBar value={waterPercent} indicatorClassName="bg-sky-500" />
          <Button variant="outline" className="w-full" onClick={addWater}>
            <Plus aria-hidden="true" />
            {WATER_GLASS_ML} ml ekle
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
