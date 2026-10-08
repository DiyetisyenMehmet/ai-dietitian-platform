"use client";

import * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";

import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { useWeightCheckInStatus, weightStore } from "@/application/health/weight-store";
import type { NutritionPlanRecord } from "@/infrastructure/nutrition/nutrition-plan-client";
import { NutritionPlanHungerCoach } from "@/presentation/components/meals/nutrition-plan-hunger-coach";
import { NutritionPlanReminders } from "@/presentation/components/meals/nutrition-plan-reminders";
import { NutritionPlanShareButton } from "@/presentation/components/meals/nutrition-plan-share-button";
import { NutritionPlanView } from "@/presentation/components/meals/nutrition-plan-view";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

import {
  buildMealReminderEntries as reminderEntries,
  dateForMealPlanDay as dateForDay,
  parseMealReminderTime as mealTime,
  hasFutureMealReminders,
} from "@/domain/account/meal-reminder-plan";
import { cancelMealReminderSchedule } from "@/infrastructure/notifications/native-meals";

function localDateYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayHasMidnightWrap(plan: NutritionPlanRecord, dayNumber: number): boolean {
  const mapping = plan.dailyPlans?.calendar?.find((item) => item.dayNumber === dayNumber);
  const cycleIndex = mapping?.cycleIndex ?? dayNumber - 1;
  const meals = plan.dailyPlans?.cycle?.[cycleIndex]?.meals ?? [];
  let previous = -1;
  for (const meal of meals) {
    const parsed = mealTime(meal.time);
    if (!parsed) continue;
    const minutes = parsed.hour * 60 + parsed.minute;
    if (previous >= 0 && minutes <= previous) return true;
    previous = minutes;
  }
  return false;
}

function currentPlanDayNumber(plan: NutritionPlanRecord, now = new Date()): number | null {
  const content = plan.dailyPlans;
  if (!content?.durationDays) return null;

  for (let dayNumber = 1; dayNumber <= content.durationDays; dayNumber += 1) {
    const baseDate = dateForDay(plan, dayNumber);
    if (localDateYmd(baseDate) === localDateYmd(now)) return dayNumber;

    if (dayHasMidnightWrap(plan, dayNumber)) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + 1);
      if (localDateYmd(nextDate) === localDateYmd(now)) {
        const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
        const cycleIndex = mapping?.cycleIndex ?? dayNumber - 1;
        const firstMeal = content.cycle?.[cycleIndex]?.meals?.[0];
        const first = firstMeal ? mealTime(firstMeal.time) : null;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const firstMinutes = first ? first.hour * 60 + first.minute : 0;
        if (currentMinutes < firstMinutes) return dayNumber;
      }
    }
  }
  return null;
}

function shareableDays(plan: NutritionPlanRecord) {
  const content = plan.dailyPlans;
  if (!content?.cycle?.length) return [];
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return Array.from({ length: content.durationDays }, (_, index) => index + 1).flatMap(
    (dayNumber) => {
      const mapping = content.calendar?.find((item) => item.dayNumber === dayNumber);
      const cycleIndex = mapping?.cycleIndex ?? (dayNumber - 1) % content.cycle.length;
      const day = content.cycle[cycleIndex];
      if (!day) return [];
      return [{ dayNumber, dateLabel: formatter.format(dateForDay(plan, dayNumber)), day }];
    },
  );
}

function completed(plan: NutritionPlanRecord): boolean {
  const days = plan.dailyPlans?.durationDays ?? 0;
  if (days <= 0) return true;
  const last = dateForDay(plan, days);
  last.setHours(23, 59, 59, 999);
  return Date.now() > last.getTime() && !hasFutureMealReminders(plan);
}

function PantryPlanningCard({ value }: { value: string }) {
  return (
    <Card className="border-primary/20">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold">Evinde hangi malzemeler var?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Buzdolabı, dolap veya dondurucundaki malzemeleri aklına geldiği gibi yaz. Diewish uygun
          olanları önce değerlendirir; sağlık hedeflerin, alerjilerin ve güvenli porsiyonlar her
          zaman önceliklidir. Eksikse yalnızca gerekli ve kolay bulunan malzemeleri tamamlar.
        </p>
        <textarea
          className="mt-4 min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          maxLength={800}
          value={value}
          onChange={(event) => nutritionPlanStore.setPantryDraft(event.target.value)}
          placeholder="Örn. yumurta, yoğurt, mercimek, bulgur, domates, patates, elma, ceviz, biraz tavuk..."
          aria-label="Evdeki malzemeler"
        />
        <div className="mt-2 flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <p>
            İsteğe bağlıdır. Bir malzemenin evde olması, plana zorla ekleneceği anlamına gelmez.
          </p>
          <span className="shrink-0 tabular-nums">{value.length}/800</span>
        </div>
      </CardContent>
    </Card>
  );
}

function WeightCheckInNotice() {
  const checkIn = useWeightCheckInStatus();
  if (!checkIn?.required) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/10">
      <CardContent className="p-5">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          Haftalık kilo check-inin gerekli
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Mevcut planını kullanmaya devam edebilirsin. Ancak güncel kilon kaydedilene kadar yeni
          plan oluşturma, planı yenileme ve uzatma işlemleri güvenlik gereği durdurulur.
        </p>
        <a
          href="/progress"
          className="mt-3 inline-flex rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          Kilo check-inini tamamla
        </a>
      </CardContent>
    </Card>
  );
}

/** Full professional plan experience: plan management plus optional local reminders. */
export function NutritionPlanExperience() {
  const { activePlan, pantryDraft } = useNutritionPlan();

  React.useEffect(() => {
    void weightStore.hydrateCheckInFromBackend();
  }, []);

  React.useEffect(() => {
    if (activePlan) return;
    try {
      cancelMealReminderSchedule();
    } catch {
      // An optional native capability must never break the web plan experience.
    }
  }, [activePlan]);

  const days =
    activePlan?.duration === "SIXTY_DAY" ? [] : activePlan ? shareableDays(activePlan) : [];
  const hungerDayNumber =
    activePlan?.duration === "SIXTY_DAY"
      ? null
      : activePlan
        ? currentPlanDayNumber(activePlan)
        : null;

  return (
    <div className="space-y-5">
      <WeightCheckInNotice />
      <div className="flex justify-end">
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/meals/plan/history">
            <History aria-hidden="true" /> Plan Geçmişi
          </Link>
        </Button>
      </div>
      {!activePlan && <PantryPlanningCard value={pantryDraft} />}
      <NutritionPlanView />
      {activePlan && hungerDayNumber !== null && (
        <NutritionPlanHungerCoach planId={activePlan.id} dayNumber={hungerDayNumber} />
      )}
      {activePlan && days.length > 0 && (
        <div className="flex justify-end">
          <NutritionPlanShareButton
            durationDays={activePlan.dailyPlans?.durationDays ?? days.length}
            days={days}
          />
        </div>
      )}
      {activePlan && (
        <NutritionPlanReminders
          entries={reminderEntries(activePlan)}
          completed={completed(activePlan)}
        />
      )}
    </div>
  );
}
