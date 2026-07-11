"use client";

import Link from "next/link";
import { Plus, UtensilsCrossed } from "lucide-react";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { Button } from "@/presentation/components/ui/button";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { NutritionSummary } from "@/presentation/components/meals/nutrition-summary";
import { MealCard } from "@/presentation/components/meals/meal-card";
import { useMeals, computeTotals } from "@/application/meals/meals-store";

export default function MealsPage() {
  const meals = useMeals();
  const totals = computeTotals(meals);
  const totalFoods = meals.reduce((sum, meal) => sum + meal.foods.length, 0);

  return (
    <AppShell
      title="Öğünler"
      headerAction={
        <Button asChild size="icon" variant="ghost" aria-label="Öğün ekle">
          <Link href="/meals/add">
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <div className="animate-fade-in space-y-6">
        <NutritionSummary totals={totals} />

        {totalFoods > 0 ? (
          <section className="space-y-3">
            {meals.map((meal, index) => (
              <MealCard key={meal.slot} meal={meal} defaultOpen={index === 0} />
            ))}
          </section>
        ) : (
          <EmptyState
            icon={UtensilsCrossed}
            title="Bugün henüz öğün eklemedin"
            description="İlk besinini ekleyerek günlük beslenme takibine başlayabilirsin."
            className="rounded-2xl border border-dashed border-border"
          />
        )}

        {totalFoods === 0 && (
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/meals/add">
                <Plus aria-hidden="true" />
                İlk öğününü ekle
              </Link>
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
