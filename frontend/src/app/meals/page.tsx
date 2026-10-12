"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, Plus, ScanLine } from "lucide-react";

import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useMeals, useMealsReadiness, computeTotals } from "@/application/meals/meals-store";
import { formatLongDate } from "@/shared/lib/format";
import { MEAL_SLOTS, type MealSlot, type NutritionTotals } from "@/domain/meals/types";
import type { NutritionPlanDuration } from "@/infrastructure/nutrition/nutrition-plan-client";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { Button } from "@/presentation/components/ui/button";
import { MicronutrientSummary } from "@/presentation/components/meals/micronutrient-summary";
import { NutritionSummary } from "@/presentation/components/meals/nutrition-summary";
import { MealCard } from "@/presentation/components/meals/meal-card";

type MealFilter = "all" | MealSlot;

const FILTERS: ReadonlyArray<{ value: MealFilter; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "breakfast", label: "Kahvaltı" },
  { value: "lunch", label: "Öğle" },
  { value: "dinner", label: "Akşam" },
  { value: "snack", label: "Ara Öğün" },
];

function durationLabel(duration: NutritionPlanDuration): string {
  if (duration === "SEVEN_DAY") return "7 günlük";
  if (duration === "FOURTEEN_DAY") return "14 günlük";
  if (duration === "THIRTY_DAY") return "30 günlük";
  return "60 günlük eski";
}

function targetOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Preserve backend-owned meal records, existing meal actions and the shared bottom navigation. */
export default function MealsPage() {
  const meals = useMeals();
  const readiness = useMealsReadiness();
  const profile = useHealthProfile();
  const totals = computeTotals(meals);
  const totalFoods = meals.reduce((sum, meal) => sum + meal.foods.length, 0);
  const { activePlan, hydrated, loading } = useNutritionPlan();

  const [filter, setFilter] = React.useState<MealFilter>("all");
  const [dateLabel, setDateLabel] = React.useState("Bugün");

  React.useEffect(() => {
    setDateLabel(formatLongDate());
  }, []);

  React.useEffect(() => {
    if (!hydrated && !loading) void nutritionPlanStore.hydrateFromBackend();
  }, [hydrated, loading]);

  // Active plan is the macro target authority; the profile may separately provide a calorie target.
  // Neither has a legacy fallback: an unset goal must not appear as a real user goal.
  const goals: Partial<NutritionTotals> = {
    calories: targetOrUndefined(activePlan?.dailyCalories) ?? targetOrUndefined(profile.dailyCalorieGoal),
    protein: targetOrUndefined(activePlan?.proteinGrams),
    carbs: targetOrUndefined(activePlan?.carbsGrams),
    fat: targetOrUndefined(activePlan?.fatGrams),
  };

  const shownMeals = filter === "all" ? meals : meals.filter((meal) => meal.slot === filter);
  const hasAnyMealData = totalFoods > 0 || meals.some((meal) => meal.isEaten);
  const verified = readiness !== "UNKNOWN";

  return (
    <AppShell title="Beslenme" hideHeader>
      <div className="animate-fade-in space-y-5">
        <header className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <h1 className="text-[clamp(2rem,8vw,2.55rem)] font-extrabold leading-tight tracking-tight text-foreground">
              Beslenme
            </h1>
            <p className="mt-1 text-sm font-medium capitalize text-muted-foreground">{dateLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button asChild variant="ghost" size="icon" aria-label="Besin tara">
              <Link href="/meals/scan"><ScanLine className="size-5" aria-hidden="true" /></Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Öğün ekle">
              <Link href="/meals/add"><Plus className="size-5" aria-hidden="true" /></Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <section aria-label="Öğün filtreleri" className="rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
          <div
            role="tablist"
            aria-label="Öğün türü"
            className="flex items-center gap-1 overflow-x-auto overscroll-x-contain"
          >
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                aria-controls="today-meals-list"
                onClick={() => setFilter(item.value)}
                className={
                  "min-h-10 shrink-0 rounded-xl px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm " +
                  (filter === item.value
                    ? "bg-teal-400/80 text-teal-950 dark:bg-teal-500 dark:text-white"
                    : "text-muted-foreground hover:bg-muted")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <NutritionSummary totals={totals} goals={goals} readiness={readiness} />

        <section className="space-y-3" aria-labelledby="today-meals-heading" id="today-meals-list">
          <div className="flex items-center justify-between gap-2">
            <h2 id="today-meals-heading" className="min-w-0 text-xl font-extrabold tracking-tight sm:text-2xl">
              Bugünün Öğünleri
            </h2>
            {filter !== "all" ? (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-300 sm:text-sm"
              >
                Tümünü Gör <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            ) : (
              <Link
                href="/meals/recent"
                className="flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-300 sm:text-sm"
              >
                Son Yediklerim <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          {!verified && !hasAnyMealData && (
            <p className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground" role="status">
              Öğün kayıtların henüz doğrulanamadı. Veriler yüklenince günlük özet güncellenecek.
            </p>
          )}
          {verified && !hasAnyMealData && (
            <p className="rounded-2xl bg-teal-500/5 px-4 py-3 text-sm text-muted-foreground">
              Bugün için henüz besin kaydı bulunmuyor. Öğününü işaretleyebilir veya besin ekleyebilirsin.
            </p>
          )}
          {shownMeals.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              Bu filtrede öğün bulunmuyor.
            </p>
          ) : (
            <div className="space-y-2.5">
              {shownMeals.map((meal) => {
                const originalIndex = MEAL_SLOTS.findIndex(({ slot }) => slot === meal.slot);
                return (
                  <MealCard
                    key={meal.slot}
                    meal={meal}
                    defaultOpen={originalIndex === 0 && totalFoods > 0}
                  />
                );
              })}
            </div>
          )}
          {verified && totalFoods === 0 && (
            <Button asChild className="w-full">
              <Link href="/meals/add"><Plus className="size-4" aria-hidden="true" /> İlk besinini ekle</Link>
            </Button>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="nutrition-tools-heading">
          <h2 id="nutrition-tools-heading" className="text-base font-bold">Beslenme Araçları</h2>
          <div className="space-y-2">
            <Link
              href="/meals/plan"
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm transition-colors hover:bg-muted/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
                <CalendarDays className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Öğün Planım</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {activePlan
                    ? durationLabel(activePlan.duration) + " kişisel plan · " + activePlan.mealsPerDay + " öğün/gün"
                    : hydrated
                      ? "Hedeflerine ve tercihlerine göre kişisel plan oluştur"
                      : "Kişisel planın yükleniyor…"}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
            <Link
              href="/meals/scan"
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm transition-colors hover:bg-muted/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
                <ScanLine className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Besin Tarayıcı</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  Fotoğraftan yaklaşık kalori ve besin değerlerini incele
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
            <Link
              href="/meals/recent"
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm transition-colors hover:bg-muted/30"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
                <Clock3 className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Son Yediklerim</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  Önceki günlerdeki gerçek besin kayıtlarını gör
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <MicronutrientSummary refreshKey={totalFoods} />
      </div>
    </AppShell>
  );
}
