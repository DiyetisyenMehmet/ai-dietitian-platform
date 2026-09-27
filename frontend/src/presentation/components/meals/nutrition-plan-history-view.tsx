"use client";

import * as React from "react";
import { ArrowLeft, CalendarDays, ChevronRight, History, Utensils } from "lucide-react";

import {
  nutritionPlanClient,
  type DailyPlan,
  type NutritionPlanRecord,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

function startDate(plan: NutritionPlanRecord): Date {
  const dateOnly = plan.startDate?.slice(0, 10);
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const fallback = new Date(plan.createdAt);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function dateForDay(plan: NutritionPlanRecord, dayNumber: number): Date {
  const date = startDate(plan);
  const mapping = plan.dailyPlans?.calendar?.find((item) => item.dayNumber === dayNumber);
  const offset = Math.max(0, Math.trunc(mapping?.dateOffsetDays ?? 0));
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayNumber - 1 + offset);
  return date;
}

function dayPlan(plan: NutritionPlanRecord, dayNumber: number): DailyPlan | null {
  const content = plan.dailyPlans;
  if (!content?.cycle?.length) return null;
  const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
  const index = mapping?.cycleIndex ?? ((dayNumber - 1) % content.cycle.length);
  return content.cycle[index] ?? null;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function historyDays(plan: NutritionPlanRecord): number[] {
  const count = plan.dailyPlans?.durationDays ?? 0;
  if (count <= 0) return [];

  const all = Array.from({ length: count }, (_, index) => index + 1);
  if (!plan.isActive) return all;

  const today = startOfLocalDay(new Date());
  return all.filter((dayNumber) => startOfLocalDay(dateForDay(plan, dayNumber)) < today);
}

function durationLabel(plan: NutritionPlanRecord): string {
  if (plan.duration === "SEVEN_DAY") return "7 günlük";
  if (plan.duration === "FOURTEEN_DAY") return "14 günlük";
  if (plan.duration === "THIRTY_DAY") return "30 günlük";
  return "60 günlük eski plan";
}

function formatDate(date: Date, includeYear = false): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function planRange(plan: NutritionPlanRecord): string {
  const count = plan.dailyPlans?.durationDays ?? 0;
  if (count <= 0) return "Tarih aralığı bulunamadı";
  const start = dateForDay(plan, 1);
  const end = dateForDay(plan, count);
  const includeYear = start.getFullYear() !== new Date().getFullYear() || end.getFullYear() !== new Date().getFullYear();
  return `${formatDate(start, includeYear)} – ${formatDate(end, includeYear)}`;
}

function createdLabel(plan: NutritionPlanRecord): string {
  const date = new Date(plan.createdAt);
  if (Number.isNaN(date.getTime())) return "Oluşturma tarihi bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function macro(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function PlanDayDetail({
  plan,
  dayNumber,
}: {
  plan: NutritionPlanRecord;
  dayNumber: number;
}) {
  const day = dayPlan(plan, dayNumber);
  const date = dateForDay(plan, dayNumber);

  if (!day) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Bu gün için plan içeriği bulunamadı.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {dayNumber}. gün
          </p>
          <h3 className="mt-1 text-lg font-bold capitalize">
            {new Intl.DateTimeFormat("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(date)}
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{Math.round(day.totalCalories)} kcal</span>
            <span>P {macro(day.totalProteinGrams)} g</span>
            <span>K {macro(day.totalCarbsGrams)} g</span>
            <span>Y {macro(day.totalFatGrams)} g</span>
          </div>
          {day.notes && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{day.notes}</p>}
        </CardContent>
      </Card>

      {day.meals.map((meal, mealIndex) => (
        <Card key={`${meal.name}-${meal.time}-${mealIndex}`}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Utensils className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold">{meal.name}</h4>
                  <span className="text-xs text-muted-foreground">{meal.time}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {Math.round(meal.calories)} kcal · P {macro(meal.proteinGrams)} g · K {macro(meal.carbsGrams)} g · Y {macro(meal.fatGrams)} g
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {meal.foods.map((food, foodIndex) => (
                <div
                  key={`${food.name}-${foodIndex}`}
                  className="flex items-start justify-between gap-3 rounded-xl border bg-muted/15 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{food.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{food.portion}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold">{Math.round(food.calories)} kcal</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Bu ekran planlanan öğünleri gösterir. Planlanmış olması, tüketildiği anlamına gelmez ve İlerleme &gt; Geçmişim kaydı oluşturmaz.
      </p>
    </div>
  );
}

export function NutritionPlanHistoryView() {
  const [plans, setPlans] = React.useState<NutritionPlanRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  const [selectedDayNumber, setSelectedDayNumber] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    void nutritionPlanClient
      .list()
      .then(({ plans: next }) => {
        if (!alive) return;
        setPlans(next);
        setFailed(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const historyPlans = React.useMemo(
    () => plans.filter((plan) => !plan.isActive || historyDays(plan).length > 0),
    [plans],
  );

  const selectedPlan = selectedPlanId
    ? plans.find((plan) => plan.id === selectedPlanId) ?? null
    : null;
  const selectedPlanDays = selectedPlan ? historyDays(selectedPlan) : [];

  React.useEffect(() => {
    if (!selectedPlan) return;
    if (selectedPlanDays.length === 0) {
      setSelectedDayNumber(null);
      return;
    }
    if (selectedDayNumber !== null && selectedPlanDays.includes(selectedDayNumber)) return;
    setSelectedDayNumber(selectedPlanDays[selectedPlanDays.length - 1] ?? null);
  }, [selectedDayNumber, selectedPlan, selectedPlanDays]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">Plan geçmişin yükleniyor…</CardContent>
      </Card>
    );
  }

  if (failed) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="font-semibold">Plan geçmişi şu anda yüklenemedi.</p>
          <p className="text-sm text-muted-foreground">Bir süre sonra tekrar deneyebilirsin.</p>
        </CardContent>
      </Card>
    );
  }

  if (selectedPlan && selectedDayNumber !== null) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => {
            setSelectedPlanId(null);
            setSelectedDayNumber(null);
          }}
        >
          <ArrowLeft aria-hidden="true" /> Plan geçmişine dön
        </Button>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                selectedPlan.isActive
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}>
                {selectedPlan.isActive ? "Aktif planın geçmiş günleri" : "Arşivlenmiş plan"}
              </span>
              <span className="text-xs text-muted-foreground">Sürüm {selectedPlan.version}</span>
            </div>
            <div>
              <h2 className="font-bold">{durationLabel(selectedPlan)} beslenme planı</h2>
              <p className="mt-1 text-xs text-muted-foreground">{planRange(selectedPlan)}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Plan geçmişi günleri">
              {selectedPlanDays.map((dayNumber) => (
                <button
                  key={dayNumber}
                  type="button"
                  aria-pressed={selectedDayNumber === dayNumber}
                  onClick={() => setSelectedDayNumber(dayNumber)}
                  className={`min-h-10 shrink-0 rounded-xl border px-3 text-sm font-semibold ${
                    selectedDayNumber === dayNumber
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  {dayNumber}. gün
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <PlanDayDetail plan={selectedPlan} dayNumber={selectedDayNumber} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <History className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Beslenme Planlayıcı geçmişi</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Geçmiş plan sürümleri ve aktif planının günü geçmiş bölümleri burada tutulur. Bu alan Tarama Geçmişi, Son Yediklerim ve İlerleme &gt; Geçmişim sistemlerinden ayrıdır.
            </p>
          </div>
        </div>
      </div>

      {historyPlans.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <CalendarDays className="mx-auto size-7 text-primary" aria-hidden="true" />
            <h2 className="mt-3 font-bold">Henüz plan geçmişin oluşmadı</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aktif planındaki günler geçtikçe veya yeni bir plan sürümü oluşturdukça burada görünecek.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {historyPlans.map((plan) => {
            const days = historyDays(plan);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:bg-muted/30"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CalendarDays className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{durationLabel(plan)} plan</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      Sürüm {plan.version}
                    </span>
                    {plan.isActive && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Aktif
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{planRange(plan)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {plan.isActive
                      ? `${days.length} geçmiş gün`
                      : `${days.length} arşivlenmiş plan günü`} · Oluşturuldu: {createdLabel(plan)}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Plan geçmişi yalnız “ne planlanmıştı?” sorusunu yanıtlar. “Ne yedim?” için Son Yediklerim, gerçek sağlık günlüğü için İlerleme &gt; Geçmişim kullanılmaya devam eder.
      </p>
    </div>
  );
}
