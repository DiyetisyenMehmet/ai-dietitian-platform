"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Droplets, Footprints, Scale, Trophy, Utensils } from "lucide-react";

import { useAuth } from "@/application/auth/auth-store";
import { useHealthProfile, healthProfileStore } from "@/application/health/health-profile-store";
import { useWeightEntries, weightStore, analyzeWeight } from "@/application/health/weight-store";
import { dateKeyToLocalNoon, formatWeightNumber, localDateKey, localDateKeyFromIso } from "@/application/health/weight-utils";
import { useDailyTracking, dailyTrackingStore } from "@/application/health/daily-tracking-store";
import { useActivity, activityStore } from "@/application/health/activity-store";
import { useMeals, useMealsReadiness, computeTotals, mealsStore } from "@/application/meals/meals-store";
import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { trackingClient, type WaterLog } from "@/infrastructure/tracking/tracking-client";
import { activityClient, type Activity } from "@/infrastructure/activity/activity-client";
import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import { WeightChart } from "@/presentation/components/health/weight-chart";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { formatNumber } from "@/shared/lib/format";
import type { WeightEntry } from "@/domain/health/types";

export type ProgressPeriod = "week" | "month" | "quarter" | "all";
const PERIODS: ReadonlyArray<{ value: ProgressPeriod; label: string; days: number | null }> = [
  { value: "week", label: "Haftalık", days: 7 },
  { value: "month", label: "Aylık", days: 30 },
  { value: "quarter", label: "3 Aylık", days: 90 },
  { value: "all", label: "Tümü", days: null },
];

/** Period filtering uses local calendar dates, not UTC timestamps or fabricated samples. */
export function weightEntriesForPeriod(entries: WeightEntry[], period: ProgressPeriod, today = localDateKey()): WeightEntry[] {
  const days = PERIODS.find((item) => item.value === period)?.days;
  if (!days) return entries;
  const date = dateKeyToLocalNoon(today);
  if (!date) return [];
  date.setDate(date.getDate() - (days - 1));
  const cutoff = localDateKey(date);
  return entries.filter((entry) => entry.date >= cutoff && entry.date <= today);
}

type TrendPoint = { day: string; label: string; total: number };
function lastSevenDays(now = new Date()): TrendPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - i));
    return {
      day: localDateKey(date),
      label: new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date),
      total: 0,
    };
  });
}
function makeTrend<T>(logs: T[], getDate: (log: T) => string, getValue: (log: T) => number): TrendPoint[] {
  const values = new Map<string, number>();
  const days = lastSevenDays();
  const validDays = new Set(days.map((entry) => entry.day));
  for (const log of logs) {
    const key = localDateKeyFromIso(getDate(log));
    const amount = getValue(log);
    if (validDays.has(key) && Number.isFinite(amount) && amount >= 0) {
      values.set(key, (values.get(key) ?? 0) + amount);
    }
  }
  return days.map((entry) => ({ ...entry, total: values.get(entry.day) ?? 0 }));
}
function validAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
function validGoal(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
function progress(value: number, goal: number): number {
  return validAmount(value) && validGoal(goal) ? Math.min(100, Math.max(0, Math.round(value / goal * 100))) : 0;
}
function formatLiters(ml: number): string {
  return (ml / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " L";
}

function MiniTrend({ points, color, label }: { points: TrendPoint[] | null; color: string; label: string }) {
  if (!points) return <p className="mt-3 text-[11px] leading-snug text-muted-foreground">Son 7 günün kayıtları alınamadı.</p>;
  const max = Math.max(...points.map((entry) => entry.total), 1);
  return (
    <div className="mt-3 grid grid-cols-7 gap-1" role="img" aria-label={label + " son 7 gün: " + points.map((entry) => entry.label + " " + formatNumber(entry.total)).join(", ")}>
      {points.map((point) => (
        <div key={point.day} className="flex min-w-0 flex-col items-center gap-1">
          <div className="flex h-12 w-full items-end rounded-md bg-muted/30 px-0.5">
            <span
              className={"block w-full rounded-t-[4px] " + color}
              style={{ height: point.total === 0 ? "0%" : Math.max(5, point.total / max * 100) + "%" }}
            />
          </div>
          <span className="max-w-full truncate text-[9px] text-muted-foreground">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function GoalRing({ value, goal, color, label }: { value: number | null; goal: number; color: string; label: string }) {
  const available = value !== null && validGoal(goal);
  const ratio = available ? progress(value, goal) : 0;
  return (
    <div
      className="flex size-[62px] shrink-0 items-center justify-center rounded-full p-[6px]"
      style={{ background: available ? "conic-gradient(" + color + " " + ratio + "%, #d9efe9 " + ratio + "%)" : "conic-gradient(#d9efe9 0% 100%)" }}
      role={available ? "progressbar" : undefined}
      aria-label={available ? label : undefined}
      aria-valuemin={available ? 0 : undefined}
      aria-valuemax={available ? 100 : undefined}
      aria-valuenow={available ? ratio : undefined}
    >
      <div className="flex size-full items-center justify-center rounded-full bg-card text-xs font-extrabold tabular-nums">
        {available ? "%" + ratio : "—"}
      </div>
    </div>
  );
}

export function ProgressHomeOverview() {
  const { user, status } = useAuth();
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const daily = useDailyTracking();
  const activity = useActivity();
  const meals = useMeals();
  const mealsReadiness = useMealsReadiness();
  const { activePlan } = useNutritionPlan();
  const [period, setPeriod] = React.useState<ProgressPeriod>("week");
  const [waterTrend, setWaterTrend] = React.useState<TrendPoint[] | null>(null);
  const [movementTrend, setMovementTrend] = React.useState<TrendPoint[] | null>(null);

  // Read existing owner-scoped APIs only. Never persist progress samples or create goal values.
  React.useEffect(() => {
    if (status !== "authenticated" || !user?.id) {
      setWaterTrend(null);
      setMovementTrend(null);
      return;
    }
    let active = true;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);
    setWaterTrend(null);
    setMovementTrend(null);
    void Promise.allSettled([
      weightStore.hydrateWeightFromBackend(),
      dailyTrackingStore.hydrateWaterFromBackend(),
      activityStore.hydrateFromBackend(),
      mealsStore.hydrateMealsFromBackend(),
      nutritionPlanStore.hydrateFromBackend(),
      onboardingClient.getProfile().then(({ profile: next }) => {
        if (active && next) healthProfileStore.update({
          currentWeightKg: next.currentWeightKg,
          targetWeightKg: next.targetWeightKg,
          dailyWaterGoalMl: next.dailyWaterGoalMl,
        });
      }),
      trackingClient.getWaterGoal().then(({ dailyWaterGoalMl }) => {
        if (active && validGoal(dailyWaterGoalMl)) dailyTrackingStore.setWaterGoal(dailyWaterGoalMl);
      }),
    ]);
    void trackingClient.listWater(since).then(({ logs }: { logs: WaterLog[] }) => {
      if (active) setWaterTrend(makeTrend(logs, (entry) => entry.loggedAt, (entry) => entry.amountMl));
    }).catch(() => { if (active) setWaterTrend(null); });
    void activityClient.listActivities(since).then(({ activities }: { activities: Activity[] }) => {
      if (active) setMovementTrend(makeTrend(activities, (entry) => entry.loggedAt, (entry) => entry.durationMinutes));
    }).catch(() => { if (active) setMovementTrend(null); });
    return () => { active = false; };
  }, [status, user?.id]);

  const filtered = React.useMemo(() => weightEntriesForPeriod(entries, period), [entries, period]);
  const latest = entries.at(-1)?.weightKg ?? null;
  const current = validGoal(profile.currentWeightKg) ? profile.currentWeightKg : latest;
  const target = validGoal(profile.targetWeightKg) ? profile.targetWeightKg : null;
  const analysis = React.useMemo(() => analyzeWeight(entries, profile.targetWeightKg), [entries, profile.targetWeightKg]);
  const firstInPeriod = filtered.at(0);
  const lastInPeriod = filtered.at(-1);
  const hasTrend = Boolean(firstInPeriod && lastInPeriod && firstInPeriod.date !== lastInPeriod.date);
  const change = hasTrend && firstInPeriod && lastInPeriod ? Number((lastInPeriod.weightKg - firstInPeriod.weightKg).toFixed(1)) : null;
  const distance = target !== null && current !== null ? Math.abs(current - target) : null;
  const calibrated = analysis.status !== "no-data" && target !== null && distance !== null;
  const motivationTitle = analysis.status === "reached" && calibrated
    ? "Hedef kilon ölçümlerine yansıdı"
    : change !== null
      ? "Kilo eğilimin güncellendi"
      : "Her kayıt ilerlemeni görünür kılar";
  const motivationCopy = calibrated && distance !== null
    ? "Hedefine " + formatWeightNumber(distance) + " kg mesafen var. Düzenli kayıtlarla ilerlemeni takip et."
    : "Hedef ve farklı günlerde kilo ölçümleri olduğunda kişisel ilerlemen burada özetlenir.";

  const waterGoal = validGoal(daily.waterGoalMl) ? daily.waterGoalMl : profile.dailyWaterGoalMl;
  const water = daily.waterReadiness !== "UNKNOWN" && validAmount(daily.waterMl) ? daily.waterMl : null;
  const minutes = activity.readiness !== "UNKNOWN" && validAmount(activity.activeMinutes) ? activity.activeMinutes : null;
  const minuteGoal = activity.activeMinutesGoal;
  const calorieGoal = validGoal(activePlan?.dailyCalories ?? 0) ? activePlan!.dailyCalories : profile.dailyCalorieGoal;
  const calorieMissing = meals.some((meal) => meal.foods.some((food) => food.missingNutrition?.calories));
  const calories = mealsReadiness !== "UNKNOWN" && meals.some((meal) => meal.foods.length > 0) && !calorieMissing
    ? computeTotals(meals).calories : null;
  const nutritionGoal = validGoal(calorieGoal) ? calorieGoal : null;

  return (
    <div className="space-y-3" data-progress-home-reference>
      <header className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">İlerleme</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Daha iyi bir sen için her gün 🌱</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link href="/history" aria-label="Geçmiş kayıtlarını aç" className="inline-flex size-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CalendarDays className="size-5" aria-hidden="true" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div role="group" aria-label="Kilo grafiği dönemi" className="grid grid-cols-4 gap-1 rounded-2xl bg-muted/35 p-1">
        {PERIODS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={period === item.value}
            onClick={() => setPeriod(item.value)}
            className={"min-h-10 min-w-0 rounded-xl px-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs " +
              (period === item.value ? "bg-emerald-500 text-white shadow-sm" : "text-muted-foreground hover:bg-card")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-[1.25rem] border border-emerald-500/10 bg-emerald-500/10 p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
          <Trophy className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{motivationTitle}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-foreground/75">{motivationCopy}</p>
        </div>
        <Link href="/history" aria-label="İlerleme geçmişini aç" className="flex size-7 shrink-0 items-center justify-center rounded-full text-emerald-600">
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      </div>

      <section aria-labelledby="progress-weight-title" className="rounded-[1.35rem] border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-500">
            <Scale className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="progress-weight-title" className="text-base font-bold">Kilo</h2>
            <p className="text-[clamp(1.5rem,6vw,2rem)] font-extrabold leading-tight tabular-nums">{current === null ? "—" : formatWeightNumber(current) + " kg"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {change === null ? "Bu dönem için karşılaştırılabilir ölçüm yok" : (change > 0 ? "+" : "") + formatWeightNumber(change) + " kg · seçilen dönem"}
            </p>
          </div>
          <div className="flex w-full flex-wrap justify-start gap-x-5 gap-y-2 pl-14 text-left sm:w-auto sm:shrink-0 sm:gap-3 sm:pl-0 sm:text-right">
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Hedef</p>
              <p className="text-xs font-bold tabular-nums">{target === null ? "—" : formatWeightNumber(target) + " kg"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Mesafe</p>
              <p className="text-xs font-bold tabular-nums">{distance === null ? "—" : formatWeightNumber(distance) + " kg"}</p>
            </div>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="mt-5 rounded-xl bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">Bu dönemde kilo ölçümü bulunmuyor.</p>
        ) : (
          <div className="mt-3">
            <WeightChart entries={filtered} targetKg={target ?? 0} className="h-40 w-full sm:h-48" />
            <div className="mt-1 flex justify-between gap-3 text-[10px] text-muted-foreground">
              <span>{firstInPeriod?.date}</span>
              <span>{lastInPeriod?.date}</span>
            </div>
          </div>
        )}
        <Link href="#weight-measurements" className="mt-2 flex min-h-9 items-center justify-end gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
          Ölçüm geçmişi <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/dashboard" className="min-w-0 rounded-[1.35rem] border border-border/70 bg-card p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Su tüketim takibine git">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-500"><Droplets className="size-5" aria-hidden="true" /></span>
            <h3 className="min-w-0 text-xs font-bold leading-tight sm:text-sm">Su Tüketimi</h3>
          </div>
          <div className="mt-3 flex items-center justify-between gap-1">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[clamp(0.85rem,3.7vw,1.12rem)] font-extrabold tabular-nums">{water === null ? "—" : formatLiters(water)}</p>
              <p className="text-[10px] text-muted-foreground">{validGoal(waterGoal) ? "/ " + formatLiters(waterGoal) + " hedef" : "Hedef belirlenmedi"}</p>
            </div>
            <GoalRing value={water} goal={waterGoal} color="#168cf3" label="Bugünkü su hedefi" />
          </div>
          <MiniTrend points={waterTrend} color="bg-sky-400" label="Su tüketimi (ml)" />
        </Link>

        <Link href="/activity" className="min-w-0 rounded-[1.35rem] border border-border/70 bg-card p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Hareket takibine git">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Footprints className="size-5" aria-hidden="true" /></span>
            <h3 className="min-w-0 text-xs font-bold leading-tight sm:text-sm">Hareket</h3>
          </div>
          <div className="mt-3 flex items-center justify-between gap-1">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[clamp(0.85rem,3.7vw,1.12rem)] font-extrabold tabular-nums">{minutes === null ? "—" : formatNumber(minutes) + " dk"}</p>
              <p className="text-[10px] text-muted-foreground">{validGoal(minuteGoal) ? "/ " + formatNumber(minuteGoal) + " dk hedef" : "Hedef belirlenmedi"}</p>
            </div>
            <GoalRing value={minutes} goal={minuteGoal} color="#05b47b" label="Bugünkü hareket hedefi" />
          </div>
          <MiniTrend points={movementTrend} color="bg-emerald-400" label="Aktivite süresi (dakika)" />
        </Link>
      </div>

      <Link href="/meals" className="flex min-w-0 items-center gap-3 rounded-[1.3rem] border border-border/70 bg-card p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500"><Utensils className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Beslenme</p>
          <p className="text-base font-extrabold tabular-nums">{calories === null ? "—" : formatNumber(Math.round(calories))} <span className="text-xs font-medium text-muted-foreground">{nutritionGoal === null ? "kcal" : "/ " + formatNumber(nutritionGoal) + " kcal"}</span></p>
          {calorieMissing && <p className="text-[10px] text-muted-foreground">Bazı kayıtların kalori bilgisi eksik.</p>}
        </div>
        {calories !== null && nutritionGoal !== null && (
          <div className="h-2 w-14 shrink-0 overflow-hidden rounded-full bg-amber-500/10" role="progressbar" aria-label="Günlük kalori hedefi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress(calories, nutritionGoal)}>
            <div className="h-full rounded-full bg-amber-400" style={{ width: progress(calories, nutritionGoal) + "%" }} />
          </div>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>
  );
}
