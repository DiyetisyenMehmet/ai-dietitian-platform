"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Plus, ScanLine } from "lucide-react";

import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { useMeals, computeTotals } from "@/application/meals/meals-store";
import type { NutritionPlanDuration } from "@/infrastructure/nutrition/nutrition-plan-client";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { Button } from "@/presentation/components/ui/button";
import { NutritionSummary } from "@/presentation/components/meals/nutrition-summary";
import { MealCard } from "@/presentation/components/meals/meal-card";

function durationLabel(duration: NutritionPlanDuration): string {
  if (duration === "SEVEN_DAY") return "7 günlük";
  if (duration === "FOURTEEN_DAY") return "14 günlük";
  if (duration === "THIRTY_DAY") return "30 günlük";
  return "60 günlük eski";
}

export default function MealsPage() {
  const meals = useMeals();
  const totals = computeTotals(meals);
  const totalFoods = meals.reduce((sum, meal) => sum + meal.foods.length, 0);
  const { activePlan, hydrated, loading } = useNutritionPlan();

  React.useEffect(() => {
    if (!hydrated && !loading) void nutritionPlanStore.hydrateFromBackend();
  }, [hydrated, loading]);

  return (
    <AppShell
      title="Beslenme"
      headerAction={
        <div className="flex items-center">
          <Button asChild size="icon" variant="ghost" aria-label="Besin tara">
            <Link href="/meals/scan">
              <ScanLine className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="icon" variant="ghost" aria-label="Öğün ekle">
            <Link href="/meals/add">
              <Plus className="size-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      }
    >
      <div className="animate-fade-in space-y-6">
        <NutritionSummary totals={totals} />

        <Link
          href="/meals/plan"
          className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-4 shadow-card transition-shadow hover:shadow-card-hover"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <CalendarDays className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Öğün Planım</span>
            <span className="block text-xs text-muted-foreground">
              {activePlan
                ? `${durationLabel(activePlan.duration)} kişisel plan · ${activePlan.mealsPerDay} öğün/gün`
                : hydrated
                  ? "Hedeflerine, tercihlerine ve alerjilerine göre kişisel plan oluştur"
                  : "Kişisel planın yükleniyor…"}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>

        <Link
          href="/meals/scan"
          className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-4 shadow-card transition-shadow hover:shadow-card-hover"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ScanLine className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Besin Tarayıcı</span>
            <span className="block text-xs text-muted-foreground">
              Yemeğinin fotoğrafını çek, koçun yaklaşık kalori ve makroları çıkarsın
            </span>
          </span>
        </Link>

        <section className="space-y-3" aria-labelledby="meal-checklist-heading">
          <div>
            <h2 id="meal-checklist-heading" className="text-base font-semibold">
              Bugünün öğünleri
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Öğünü yaptıysan “Yedim” olarak işaretle. Yediklerini ayrıntılı eklemek isteğe bağlıdır.
            </p>
          </div>
          {meals.map((meal, index) => (
            <MealCard key={meal.slot} meal={meal} defaultOpen={index === 0 && totalFoods > 0} />
          ))}
        </section>

        {totalFoods === 0 && (
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/meals/add">
                <Plus aria-hidden="true" />
                İlk besinini ekle
              </Link>
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
