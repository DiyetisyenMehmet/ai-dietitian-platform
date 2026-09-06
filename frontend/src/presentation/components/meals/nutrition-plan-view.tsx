"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Droplets,
  RefreshCw,
  Sparkles,
  Target,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";

import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { ApiError } from "@/infrastructure/api/http-client";
import type {
  DailyPlan,
  NutritionPlanContent,
  NutritionPlanDuration,
  NutritionPlanRecord,
  PlannedMeal,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

const DURATION_DAYS: Record<NutritionPlanDuration, number> = {
  THIRTY_DAY: 30,
  SIXTY_DAY: 60,
};

const MEAL_NAME_TR: Record<string, string> = {
  breakfast: "Kahvaltı",
  lunch: "Öğle",
  dinner: "Akşam",
  snack: "Ara öğün",
  "morning snack": "Kuşluk",
  "afternoon snack": "Ara öğün",
  supper: "Gece öğünü",
};

function durationLabel(duration: NutritionPlanDuration): string {
  return duration === "THIRTY_DAY" ? "30 günlük" : "60 günlük";
}

function mealName(name: string): string {
  const normalized = name.trim().toLocaleLowerCase("tr-TR");
  return MEAL_NAME_TR[normalized] ?? name;
}

function safeContent(plan: NutritionPlanRecord): NutritionPlanContent | null {
  const value = plan.dailyPlans;
  if (!value || !Array.isArray(value.cycle) || value.cycle.length === 0) return null;
  return value;
}

function dayPlan(content: NutritionPlanContent, dayNumber: number): DailyPlan | null {
  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  const index = mapping?.cycleIndex ?? ((dayNumber - 1) % content.cycle.length);
  return content.cycle[index] ?? null;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function currentDayNumber(plan: NutritionPlanRecord, durationDays: number): number {
  const created = new Date(plan.createdAt);
  if (Number.isNaN(created.getTime())) return 1;
  const diff = Math.floor((startOfLocalDay(new Date()) - startOfLocalDay(created)) / 86_400_000) + 1;
  return Math.min(durationDays, Math.max(1, diff));
}

function dateForPlanDay(plan: NutritionPlanRecord, dayNumber: number): Date {
  const date = new Date(plan.createdAt);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayNumber - 1);
  return date;
}

function dateLabel(plan: NutritionPlanRecord, dayNumber: number): string {
  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dateForPlanDay(plan, dayNumber));
}

function number(value: number): string {
  return Math.round(value).toLocaleString("tr-TR");
}

function planError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      return "Yeni öğün planı oluşturma hakkın için uygun abonelik gerekiyor.";
    }
    if (error.status === 429) {
      return "Öğün planı oluşturma limitine ulaştın. Daha sonra tekrar deneyebilirsin.";
    }
  }
  return "Öğün planı oluşturulamadı. Lütfen tekrar dene.";
}

function MealBlock({ meal }: { meal: PlannedMeal }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-primary" aria-hidden="true" />
            <p className="text-xs font-semibold text-primary">{meal.time || "Saat belirtilmedi"}</p>
          </div>
          <h4 className="mt-1 text-base font-semibold">{mealName(meal.name)}</h4>
        </div>
        {meal.calories > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
            ~{number(meal.calories)} kcal
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {meal.foods.map((food, index) => (
          <div key={`${food.name}-${index}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 font-medium">{food.name}</span>
            <span className="shrink-0 text-right text-muted-foreground">{food.portion}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-1">Protein {number(meal.proteinGrams)} g</span>
        <span className="rounded-full bg-muted px-2 py-1">Karbonhidrat {number(meal.carbsGrams)} g</span>
        <span className="rounded-full bg-muted px-2 py-1">Yağ {number(meal.fatGrams)} g</span>
      </div>

      {meal.explanation?.trim() && (
        <details className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none font-medium">Bu öğün neden seçildi?</summary>
          <p className="mt-2 leading-relaxed text-muted-foreground">{meal.explanation}</p>
        </details>
      )}
    </div>
  );
}

function DayCard({
  plan,
  dayNumber,
  day,
  open,
}: {
  plan: NutritionPlanRecord;
  dayNumber: number;
  day: DailyPlan;
  open: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-border bg-card shadow-sm" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {dayNumber}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{dayNumber}. Gün</span>
          <span className="block truncate text-xs capitalize text-muted-foreground">
            {dateLabel(plan, dayNumber)}
          </span>
        </span>
        <span className="text-xs font-medium text-muted-foreground">~{number(day.totalCalories)} kcal</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>

      <div className="space-y-3 border-t border-border/70 p-4">
        {day.meals.map((meal, index) => (
          <MealBlock key={`${meal.name}-${meal.time}-${index}`} meal={meal} />
        ))}

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Protein</p>
            <p className="mt-0.5 text-sm font-semibold">{number(day.totalProteinGrams)} g</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Karbonhidrat</p>
            <p className="mt-0.5 text-sm font-semibold">{number(day.totalCarbsGrams)} g</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Yağ</p>
            <p className="mt-0.5 text-sm font-semibold">{number(day.totalFatGrams)} g</p>
          </div>
        </div>

        {day.notes?.trim() && <p className="text-xs leading-relaxed text-muted-foreground">{day.notes}</p>}
      </div>
    </details>
  );
}

function EmptyPlan({
  generating,
  generatingDuration,
}: {
  generating: boolean;
  generatingDuration: NutritionPlanDuration | null;
}) {
  const create = async (duration: NutritionPlanDuration) => {
    try {
      await nutritionPlanStore.generate(duration);
      toast.success("Kişisel öğün planın hazırlandı");
    } catch (error) {
      toast.error(planError(error));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="p-5">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold">Kişisel öğün planını oluştur</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Diewish; profilindeki hedefleri, beslenme tercihini ve alerjilerini dikkate alır. Kalori ve makro hedefleri hesaplama motorundan gelir; öğünler porsiyon ve saatleriyle hazırlanır.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {(["THIRTY_DAY", "SIXTY_DAY"] as NutritionPlanDuration[]).map((duration) => {
          const selected = generatingDuration === duration;
          return (
            <Card key={duration}>
              <CardContent className="p-4">
                <CalendarDays className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{durationLabel(duration)} plan</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Günlük saat, porsiyon, kalori ve makro çerçevesiyle kişiselleştirilmiş beslenme planı.
                </p>
                <Button className="mt-4 w-full" disabled={generating} onClick={() => void create(duration)}>
                  <Sparkles className={selected ? "animate-pulse" : ""} aria-hidden="true" />
                  {selected ? "Hazırlanıyor…" : "Planı oluştur"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Plan yalnızca gıda temellidir. Diewish bu özellikte takviye, vitamin/mineral ürünü, bitkisel kür veya doz önermez.
      </p>
    </div>
  );
}

export function NutritionPlanView() {
  const { activePlan, hydrated, loading, generating, generatingDuration } = useNutritionPlan();
  const [weekIndex, setWeekIndex] = React.useState(0);

  React.useEffect(() => {
    if (!hydrated && !loading) void nutritionPlanStore.hydrateFromBackend();
  }, [hydrated, loading]);

  React.useEffect(() => {
    if (!activePlan) return;
    const content = safeContent(activePlan);
    const durationDays = content?.durationDays || DURATION_DAYS[activePlan.duration];
    const today = currentDayNumber(activePlan, durationDays);
    setWeekIndex(Math.floor((today - 1) / 7));
  }, [activePlan]);

  if (!hydrated || loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Öğün planın yükleniyor…</div>;
  }

  if (!activePlan) {
    return <EmptyPlan generating={generating} generatingDuration={generatingDuration} />;
  }

  const content = safeContent(activePlan);
  if (!content) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Bu planın öğün içeriği görüntülenemiyor. Planı yenileyerek güncel bir sürüm oluşturabilirsin.
        </CardContent>
      </Card>
    );
  }

  const durationDays = content.durationDays || DURATION_DAYS[activePlan.duration];
  const today = currentDayNumber(activePlan, durationDays);
  const currentWeek = Math.floor((today - 1) / 7);
  const totalWeeks = Math.ceil(durationDays / 7);
  const safeWeekIndex = Math.min(totalWeeks - 1, Math.max(0, weekIndex));
  const weekStart = safeWeekIndex * 7 + 1;
  const weekEnd = Math.min(durationDays, weekStart + 6);
  const visibleDays = Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index);

  const regenerate = async () => {
    try {
      await nutritionPlanStore.regenerate(activePlan.id);
      toast.success("Öğün planın yenilendi");
    } catch (error) {
      toast.error(planError(error));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Öğün Planım</p>
              <h2 className="mt-1 text-xl font-bold">{durationLabel(activePlan.duration)} kişisel plan</h2>
              <p className="mt-1 text-xs text-muted-foreground">Sürüm {activePlan.version} · bugün {today}. gün</p>
            </div>
            <Button variant="ghost" size="sm" disabled={generating} onClick={() => void regenerate()}>
              <RefreshCw className={generating ? "animate-spin" : ""} aria-hidden="true" />
              {generating ? "Hazırlanıyor" : "Yenile"}
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-background/80 p-3">
              <Target className="size-4 text-primary" aria-hidden="true" />
              <p className="mt-2 text-lg font-bold">~{number(activePlan.dailyCalories)}</p>
              <p className="text-[11px] text-muted-foreground">kcal / gün</p>
            </div>
            <div className="rounded-xl bg-background/80 p-3">
              <Utensils className="size-4 text-primary" aria-hidden="true" />
              <p className="mt-2 text-lg font-bold">{activePlan.mealsPerDay}</p>
              <p className="text-[11px] text-muted-foreground">öğün / gün</p>
            </div>
            <div className="rounded-xl bg-background/80 p-3">
              <Droplets className="size-4 text-primary" aria-hidden="true" />
              <p className="mt-2 text-lg font-bold">{(activePlan.waterMl / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} L</p>
              <p className="text-[11px] text-muted-foreground">su hedefi</p>
            </div>
            <div className="rounded-xl bg-background/80 p-3">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <p className="mt-2 text-lg font-bold">{content.cycleLengthDays}</p>
              <p className="text-[11px] text-muted-foreground">farklı gün döngüsü</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-background/80 px-2.5 py-1">Protein {number(activePlan.proteinGrams)} g</span>
            <span className="rounded-full bg-background/80 px-2.5 py-1">Karbonhidrat {number(activePlan.carbsGrams)} g</span>
            <span className="rounded-full bg-background/80 px-2.5 py-1">Yağ {number(activePlan.fatGrams)} g</span>
          </div>
        </CardContent>
      </Card>

      {activePlan.summary?.trim() && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold">Planın özeti</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{activePlan.summary}</p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="plan-days-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="plan-days-heading" className="text-base font-semibold">Plan günleri</h3>
            <p className="mt-1 text-xs text-muted-foreground">Bir günü açarak saat, porsiyon ve öğün ayrıntılarını görebilirsin.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekIndex(currentWeek)} disabled={safeWeekIndex === currentWeek}>
            Bugün
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border px-2 py-2">
          <Button variant="ghost" size="icon" aria-label="Önceki hafta" disabled={safeWeekIndex === 0} onClick={() => setWeekIndex((value) => Math.max(0, value - 1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold">{safeWeekIndex + 1}. Hafta</p>
            <p className="text-[11px] text-muted-foreground">{weekStart}–{weekEnd}. günler</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sonraki hafta" disabled={safeWeekIndex >= totalWeeks - 1} onClick={() => setWeekIndex((value) => Math.min(totalWeeks - 1, value + 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-2">
          {visibleDays.map((dayNumber) => {
            const day = dayPlan(content, dayNumber);
            if (!day) return null;
            return <DayCard key={dayNumber} plan={activePlan} dayNumber={dayNumber} day={day} open={dayNumber === today} />;
          })}
        </div>
      </section>

      {Array.isArray(activePlan.recommendations) && activePlan.recommendations.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold">Genel beslenme notları</summary>
          <ol className="mt-3 space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {activePlan.recommendations.map((item, index) => (
              <li key={`${item}-${index}`} className="list-decimal">{item}</li>
            ))}
          </ol>
        </details>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Öğün içerikleri yaklaşık besin değerleriyle hazırlanır. Plan yalnızca gıda temellidir; takviye, ilaç veya doz önerisi içermez.
      </p>
    </div>
  );
}
