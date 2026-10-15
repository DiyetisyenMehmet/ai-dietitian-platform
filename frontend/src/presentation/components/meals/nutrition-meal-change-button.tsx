"use client";
import * as React from "react";
import { toast } from "sonner";
import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import {
  nutritionPlanClient,
  type NutritionPlanRecord,
  type NutritionRights,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { useWeightCheckInStatus } from "@/application/health/weight-store";
import { Button } from "@/presentation/components/ui/button";
import { planError } from "./nutrition-plan-errors";

export function NutritionMealChangeButton({
  plan,
  dayNumber,
  mealIndex,
}: {
  plan: NutritionPlanRecord;
  dayNumber: number;
  mealIndex: number;
}) {
  const { durable, generating } = useNutritionPlan();
  const checkIn = useWeightCheckInStatus()?.required === true;
  const [rights, setRights] = React.useState<NutritionRights | null>(null),
    [failure, setFailure] = React.useState<string | null>(null),
    [starting, setStarting] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    if (!durable) return;
    setRights(null);
    setFailure(null);
    void nutritionPlanClient
      .rights("MEAL_CHANGE", plan.id, dayNumber)
      .then(({ rights }) => {
        if (active) setRights(rights);
      })
      .catch((error) => {
        if (active) setFailure(planError(error));
      });
    return () => {
      active = false;
    };
  }, [durable, plan.id, dayNumber, generating]);
  if (!durable) return null;
  const replace = async () => {
    if (starting || generating || !rights?.available) return;
    setStarting(true);
    try {
      await nutritionPlanStore.replaceMeal(plan, dayNumber, mealIndex);
    } catch (error) {
      toast.error(planError(error));
    } finally {
      setStarting(false);
    }
  };
  const label =
    rights?.tier === "FREE"
      ? `Kalan: ${rights.freeRemaining}/1`
      : rights
        ? `Bugün ${rights.dayRemaining} · Ay ${rights.monthRemaining}`
        : "Haklar kontrol ediliyor";
  const description =
    rights?.tier === "FREE"
      ? "7 günlük planında her gün için 1 öğün değiştirme hakkın var."
      : rights?.tier === "PREMIUM_PLUS"
        ? "Günde 3, ayda toplam 10 öğün değiştirebilirsin."
        : "Günde 2, ayda toplam 5 öğün değiştirebilirsin.";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {label}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={starting || generating || checkIn || !rights?.available}
          onClick={() => void replace()}
        >
          Öğünü Değiştir
        </Button>
      </div>
      <p className="mt-1 text-right text-[11px] leading-relaxed text-muted-foreground">
        {failure ?? (rights ? description : "Kullanım hakları doğrulanıyor.")}
      </p>
      {rights && !rights.available && (
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {rights.tier === "FREE"
            ? "Bu plan gününün öğün değiştirme hakkı kullanıldı."
            : rights.dayRemaining === 0
              ? "Bugünkü öğün değiştirme hakkın bitti."
              : "Bu abonelik dönemindeki öğün değiştirme hakkın bitti."}
        </p>
      )}
    </div>
  );
}
