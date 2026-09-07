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
  Trash2,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";

import { nutritionPlanStore, useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { ApiError } from "@/infrastructure/api/http-client";
import {
  SUPPORTED_NUTRITION_PLAN_DURATIONS,
  type CreateNutritionPlanDeviationInput,
  type DailyPlan,
  type NutritionPlanContent,
  type NutritionPlanDeviationRecord,
  type NutritionPlanDuration,
  type NutritionPlanRecord,
  type PlannedMeal,
  type SupportedNutritionPlanDuration,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { NutritionPlanAdherenceSummary } from "@/presentation/components/meals/nutrition-plan-adherence-summary";
import { NutritionPlanDayShareButton } from "@/presentation/components/meals/nutrition-plan-day-share-button";
import {
  NutritionPlanKacamak,
  useNutritionPlanDeviations,
} from "@/presentation/components/meals/nutrition-plan-kacamak";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

const DURATION_DAYS: Record<NutritionPlanDuration, number> = {
  SEVEN_DAY: 7,
  FOURTEEN_DAY: 14,
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

interface PlanPosition {
  focusDayNumber: number;
  exactToday: boolean;
  completed: boolean;
}

function durationLabel(duration: NutritionPlanDuration): string {
  if (duration === "SEVEN_DAY") return "7 günlük";
  if (duration === "FOURTEEN_DAY") return "14 günlük";
  if (duration === "THIRTY_DAY") return "30 günlük";
  return "60 günlük eski";
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

function planStartLocalDate(plan: NutritionPlanRecord): Date {
  const dateOnly = plan.startDate?.slice(0, 10);
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const local = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (!Number.isNaN(local.getTime())) return local;
  }

  const created = new Date(plan.createdAt);
  if (Number.isNaN(created.getTime())) return new Date();
  return created;
}

function calendarOffset(plan: NutritionPlanRecord, dayNumber: number): number {
  const content = safeContent(plan);
  const mapping = content?.calendar?.find((item) => item.dayNumber === dayNumber);
  return Math.max(0, Math.trunc(mapping?.dateOffsetDays ?? 0));
}

function dateForPlanDay(plan: NutritionPlanRecord, dayNumber: number): Date {
  const date = planStartLocalDate(plan);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayNumber - 1 + calendarOffset(plan, dayNumber));
  return date;
}

function planPosition(plan: NutritionPlanRecord, durationDays: number): PlanPosition {
  const today = startOfLocalDay(new Date());
  let lastDate = 0;

  for (let dayNumber = 1; dayNumber <= durationDays; dayNumber += 1) {
    const date = startOfLocalDay(dateForPlanDay(plan, dayNumber));
    lastDate = date;
    if (date === today) return { focusDayNumber: dayNumber, exactToday: true, completed: false };
    if (date > today) return { focusDayNumber: dayNumber, exactToday: false, completed: false };
  }

  return {
    focusDayNumber: durationDays,
    exactToday: false,
    completed: today > lastDate,
  };
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
      return "Bu plan yönetimi özelliği Premium ve Premium Plus kullanıcıları içindir.";
    }
    if (error.code === "NUTRITION_PLAN_DAY_STALE") {
      return "Plan günü değişmiş. Güncel plan yeniden yüklendikten sonra tekrar deneyebilirsin.";
    }
    if (error.code === "NUTRITION_PLAN_INCOMPLETE") {
      return "Planın tüm günleri güvenilir şekilde oluşturulamadı. Lütfen tekrar dene.";
    }
    if (error.status === 429) {
      return "Öğün planı oluşturma limitine ulaştın. Daha sonra tekrar deneyebilirsin.";
    }
  }
  return "Öğün planı işlemi tamamlanamadı. Lütfen tekrar dene.";
}

function MealBlock({
  dayNumber,
  mealIndex,
  meal,
  deviations,
  deviationsLoading,
  canLogKacamak,
  onCreateDeviation,
  onDeleteDeviation,
}: {
  dayNumber: number;
  mealIndex: number;
  meal: PlannedMeal;
  deviations: NutritionPlanDeviationRecord[];
  deviationsLoading: boolean;
  canLogKacamak: boolean;
  onCreateDeviation(input: CreateNutritionPlanDeviationInput): Promise<NutritionPlanDeviationRecord>;
  onDeleteDeviation(deviationId: string): Promise<void>;
}) {
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

      <NutritionPlanKacamak
        dayNumber={dayNumber}
        mealIndex={mealIndex}
        meal={meal}
        deviations={deviations}
        deviationsLoading={deviationsLoading}
        disabled={!canLogKacamak}
        onCreate={onCreateDeviation}
        onDelete={onDeleteDeviation}
      />
    </div>
  );
}

function DayCard({
  plan,
  dayNumber,
  day,
  open,
  canLogKacamak,
  canRefresh,
  canShift,
  generating,
  deviations,
  deviationsLoading,
  onCreateDeviation,
  onDeleteDeviation,
  onRefreshDay,
  onShiftDay,
}: {
  plan: NutritionPlanRecord;
  dayNumber: number;
  day: DailyPlan;
  open: boolean;
  canLogKacamak: boolean;
  canRefresh: boolean;
  canShift: boolean;
  generating: boolean;
  deviations: NutritionPlanDeviationRecord[];
  deviationsLoading: boolean;
  onCreateDeviation(input: CreateNutritionPlanDeviationInput): Promise<NutritionPlanDeviationRecord>;
  onDeleteDeviation(deviationId: string): Promise<void>;
  onRefreshDay(dayNumber: number): Promise<void>;
  onShiftDay(dayNumber: number): Promise<void>;
}) {
  const [confirmShift, setConfirmShift] = React.useState(false);
  const [shifting, setShifting] = React.useState(false);
  const dayDeviations = deviations.filter((item) => item.dayNumber === dayNumber);
  const planDayDateLabel = dateLabel(plan, dayNumber);

  const shift = async () => {
    if (shifting || generating) return;
    setShifting(true);
    try {
      await onShiftDay(dayNumber);
      setConfirmShift(false);
    } finally {
      setShifting(false);
    }
  };

  return (
    <details className="group rounded-2xl border border-border bg-card shadow-sm" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          {dayNumber}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{dayNumber}. Gün</span>
          <span className="block truncate text-xs capitalize text-muted-foreground">{planDayDateLabel}</span>
        </span>
        <span className="text-xs font-medium text-muted-foreground">~{number(day.totalCalories)} kcal</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>

      <div className="space-y-3 border-t border-border/70 p-4">
        {day.meals.map((meal, index) => (
          <MealBlock
            key={`${meal.name}-${meal.time}-${index}`}
            dayNumber={dayNumber}
            mealIndex={index}
            meal={meal}
            deviations={dayDeviations}
            deviationsLoading={deviationsLoading}
            canLogKacamak={canLogKacamak}
            onCreateDeviation={onCreateDeviation}
            onDeleteDeviation={onDeleteDeviation}
          />
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

        {confirmShift && canShift && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-semibold">Bugünü yarına taşı</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Bugünkü öğünlerin yarına taşınacak. Sonraki plan günlerin de bir gün ileri kayacak. Geçmiş günlerin değişmeyecek.
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={shifting} onClick={() => setConfirmShift(false)}>Vazgeç</Button>
              <Button size="sm" isLoading={shifting} onClick={() => void shift()}>Yarına taşı</Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Bu özellik Premium ve Premium Plus kullanıcıları içindir.</p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
          {canShift && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generating || shifting}
              aria-expanded={confirmShift}
              onClick={() => setConfirmShift((value) => !value)}
            >
              <CalendarDays aria-hidden="true" />
              Bugünü yarına taşı
            </Button>
          )}
          {canRefresh && (
            <Button type="button" variant="outline" size="sm" disabled={generating} onClick={() => void onRefreshDay(dayNumber)}>
              <RefreshCw aria-hidden="true" />
              Bu günü yenile
            </Button>
          )}
          <NutritionPlanDayShareButton dayNumber={dayNumber} dateLabel={planDayDateLabel} day={day} />
        </div>
        {!canRefresh && (
          <p className="text-right text-[11px] text-muted-foreground">Geçmiş günler plan geçmişini korumak için yenilenmez.</p>
        )}
      </div>
    </details>
  );
}

function DurationOptions({
  generating,
  generatingDuration,
  currentPlan,
}: {
  generating: boolean;
  generatingDuration: SupportedNutritionPlanDuration | null;
  currentPlan?: NutritionPlanRecord;
}) {
  const create = async (duration: SupportedNutritionPlanDuration) => {
    if (duration === currentPlan?.duration) return;
    const currentDays = currentPlan ? safeContent(currentPlan)?.durationDays ?? DURATION_DAYS[currentPlan.duration] : 0;
    const targetDays = DURATION_DAYS[duration];
    const extending = Boolean(currentPlan && targetDays > currentDays);

    try {
      if (currentPlan && extending) {
        await nutritionPlanStore.extend(currentPlan.id, duration);
        toast.success(`Planın mevcut günler korunarak ${targetDays} güne uzatıldı`);
      } else {
        await nutritionPlanStore.generate(duration);
        toast.success(`${durationLabel(duration)} kişisel öğün planın hazırlandı`);
      }
    } catch (error) {
      toast.error(planError(error));
    }
  };

  const durations = currentPlan
    ? SUPPORTED_NUTRITION_PLAN_DURATIONS.filter((duration) => duration !== currentPlan.duration)
    : SUPPORTED_NUTRITION_PLAN_DURATIONS;
  const currentDays = currentPlan ? safeContent(currentPlan)?.durationDays ?? DURATION_DAYS[currentPlan.duration] : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {durations.map((duration) => {
        const selected = generatingDuration === duration;
        const targetDays = DURATION_DAYS[duration];
        const extending = Boolean(currentPlan && targetDays > currentDays);
        return (
          <Card key={duration}>
            <CardContent className="p-4">
              <CalendarDays className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{durationLabel(duration)} plan</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {extending
                  ? `Mevcut ${currentDays} gün korunur, yalnızca ${targetDays - currentDays} yeni gün eklenir.`
                  : "Daha kısa süre seçildiğinde bugünden başlayan yeni bir plan hazırlanır."}
              </p>
              <Button className="mt-4 w-full" disabled={generating} onClick={() => void create(duration)}>
                <Sparkles className={selected ? "animate-pulse" : ""} aria-hidden="true" />
                {selected ? "Hazırlanıyor…" : extending ? `${targetDays} güne uzat` : "Yeni plan oluştur"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EmptyPlan({ generating, generatingDuration }: { generating: boolean; generatingDuration: SupportedNutritionPlanDuration | null }) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="p-5">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-bold">Kişisel öğün planını oluştur</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Diewish; profilindeki hedefleri, beslenme tercihini ve alerjilerini dikkate alır. Kalori ve makro hedefleri hesaplama motorundan gelir; seçtiğin 7, 14 veya 30 günün her biri ayrı plan günü olarak hazırlanır.
          </p>
        </CardContent>
      </Card>
      <DurationOptions generating={generating} generatingDuration={generatingDuration} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Plan yalnızca gıda temellidir. Diewish bu özellikte takviye, vitamin/mineral ürünü, bitkisel kür veya doz önermez.
      </p>
    </div>
  );
}

export function NutritionPlanView() {
  const { activePlan, hydrated, loading, generating, generatingDuration } = useNutritionPlan();
  const [weekIndex, setWeekIndex] = React.useState(0);
  const [showDurationOptions, setShowDurationOptions] = React.useState(false);
  const [showRefreshOptions, setShowRefreshOptions] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deletingPlan, setDeletingPlan] = React.useState(false);
  const { deviations, loading: deviationsLoading, createDeviation, deleteDeviation } =
    useNutritionPlanDeviations(activePlan?.id ?? null);

  React.useEffect(() => {
    if (!hydrated && !loading) void nutritionPlanStore.hydrateFromBackend();
  }, [hydrated, loading]);

  React.useEffect(() => {
    if (!activePlan) return;
    const content = safeContent(activePlan);
    const durationDays = content?.durationDays || DURATION_DAYS[activePlan.duration];
    const position = planPosition(activePlan, durationDays);
    setWeekIndex(Math.floor((position.focusDayNumber - 1) / 7));
    setShowDurationOptions(false);
    setShowRefreshOptions(false);
    setConfirmDelete(false);
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
  const position = planPosition(activePlan, durationDays);
  const focusDay = position.focusDayNumber;
  const currentWeek = Math.floor((focusDay - 1) / 7);
  const totalWeeks = Math.ceil(durationDays / 7);
  const safeWeekIndex = Math.min(totalWeeks - 1, Math.max(0, weekIndex));
  const weekStart = safeWeekIndex * 7 + 1;
  const weekEnd = Math.min(durationDays, weekStart + 6);
  const visibleDays = Array.from({ length: weekEnd - weekStart + 1 }, (_, index) => weekStart + index);
  const todayTimestamp = startOfLocalDay(new Date());
  const elapsedDayNumbers = Array.from({ length: durationDays }, (_, index) => index + 1).filter(
    (dayNumber) => startOfLocalDay(dateForPlanDay(activePlan, dayNumber)) <= todayTimestamp,
  );

  const statusLine = position.completed
    ? "Plan tamamlandı"
    : position.exactToday
      ? `bugün ${focusDay}. gün`
      : `bugün ara gün · sıradaki ${focusDay}. gün ${dateLabel(activePlan, focusDay)}`;

  const regenerateAll = async () => {
    try {
      await nutritionPlanStore.regenerate(activePlan.id);
      toast.success("Bütün öğün planın yenilendi");
    } catch (error) {
      toast.error(planError(error));
    }
  };

  const refreshFromFocus = async () => {
    try {
      await nutritionPlanStore.refresh(activePlan.id, { mode: "FROM_DAY", dayNumber: focusDay });
      toast.success(`${focusDay}. günden sonraki planın yenilendi`);
    } catch (error) {
      toast.error(planError(error));
    }
  };

  const refreshDay = async (dayNumber: number) => {
    try {
      await nutritionPlanStore.refresh(activePlan.id, { mode: "DAY", dayNumber });
      toast.success(`${dayNumber}. gün yenilendi`);
    } catch (error) {
      toast.error(planError(error));
    }
  };

  const shiftDay = async (dayNumber: number) => {
    try {
      await nutritionPlanStore.shiftToday(activePlan.id, dayNumber);
      toast.success("Bugünkü plan yarına taşındı. Sonraki günler de bir gün ileri kaydırıldı.");
    } catch (error) {
      toast.error(planError(error));
      throw error;
    }
  };

  const removePlan = async () => {
    if (deletingPlan || generating) return;
    setDeletingPlan(true);
    try {
      await nutritionPlanStore.remove(activePlan.id);
      toast.success("Öğün planı silindi");
    } catch {
      toast.error("Öğün planı silinemedi. Lütfen tekrar dene.");
    } finally {
      setDeletingPlan(false);
      setConfirmDelete(false);
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
              <p className="mt-1 text-xs text-muted-foreground">Sürüm {activePlan.version} · {statusLine}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={generating || deletingPlan || position.completed}
              aria-expanded={showRefreshOptions}
              onClick={() => setShowRefreshOptions((value) => !value)}
            >
              <RefreshCw className={generating ? "animate-spin" : ""} aria-hidden="true" />
              {generating ? "Hazırlanıyor" : "Yenile"}
            </Button>
          </div>

          {showRefreshOptions && !position.completed && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-background/80 p-4">
              <p className="text-sm font-semibold">
                {position.exactToday ? `Şu anda planının ${focusDay}. günündesin.` : `Bugün ara gün. Sıradaki plan günün ${focusDay}. gün.`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Bütün planı yeniden oluşturmak mevcut plan devamlılığını değiştirebilir. Geçmiş günleri korumak için sıradaki günden sonrasını yenilemen önerilir.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={generating} onClick={() => void refreshFromFocus()}>
                  {position.exactToday ? "Bugünden sonrasını yenile" : "Sıradaki günden sonrasını yenile"}
                </Button>
                <Button variant="outline" size="sm" disabled={generating} onClick={() => void regenerateAll()}>
                  Bütün planı yenile
                </Button>
                <Button variant="ghost" size="sm" disabled={generating} onClick={() => setShowRefreshOptions(false)}>Vazgeç</Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Kontrollü yenileme Premium ve Premium Plus özelliğidir.</p>
            </div>
          )}

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
              <p className="mt-2 text-lg font-bold">{content.durationDays}</p>
              <p className="text-[11px] text-muted-foreground">planlanan gün</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-background/80 px-2.5 py-1">Protein {number(activePlan.proteinGrams)} g</span>
            <span className="rounded-full bg-background/80 px-2.5 py-1">Karbonhidrat {number(activePlan.carbsGrams)} g</span>
            <span className="rounded-full bg-background/80 px-2.5 py-1">Yağ {number(activePlan.fatGrams)} g</span>
          </div>
        </CardContent>
      </Card>

      <NutritionPlanAdherenceSummary
        content={content}
        elapsedDayNumbers={elapsedDayNumbers}
        deviations={deviations}
        loading={deviationsLoading}
      />

      <section className="space-y-3" aria-labelledby="plan-days-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="plan-days-heading" className="text-base font-semibold">Plan günleri</h3>
            <p className="mt-1 text-xs text-muted-foreground">Bir günü açarak saat, porsiyon, öğün ve Kaçamak ayrıntılarını yönetebilirsin.</p>
          </div>
          {safeWeekIndex !== currentWeek && (
            <Button variant="outline" size="sm" onClick={() => setWeekIndex(currentWeek)}>Bugün</Button>
          )}
        </div>

        {totalWeeks > 1 && (
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
        )}

        <div className="space-y-2">
          {visibleDays.map((dayNumber) => {
            const day = dayPlan(content, dayNumber);
            if (!day) return null;
            const planDate = startOfLocalDay(dateForPlanDay(activePlan, dayNumber));
            const isToday = planDate === todayTimestamp;
            return (
              <DayCard
                key={dayNumber}
                plan={activePlan}
                dayNumber={dayNumber}
                day={day}
                open={dayNumber === focusDay}
                canLogKacamak={planDate <= todayTimestamp}
                canRefresh={planDate >= todayTimestamp && !position.completed}
                canShift={isToday && !position.completed}
                generating={generating}
                deviations={deviations}
                deviationsLoading={deviationsLoading}
                onCreateDeviation={createDeviation}
                onDeleteDeviation={deleteDeviation}
                onRefreshDay={refreshDay}
                onShiftDay={shiftDay}
              />
            );
          })}
        </div>
      </section>

      {activePlan.summary?.trim() && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold">Planın özeti</summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{activePlan.summary}</p>
        </details>
      )}

      {Array.isArray(activePlan.recommendations) && activePlan.recommendations.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold">Genel beslenme notları</summary>
          <ol className="mt-3 space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {activePlan.recommendations.map((item, index) => <li key={`${item}-${index}`} className="list-decimal">{item}</li>)}
          </ol>
        </details>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Plan yönetimi</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Planını uzatabilir, daha kısa yeni bir plan başlatabilir veya artık kullanmadığın planı kaldırabilirsin.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={generating || deletingPlan}
            aria-expanded={showDurationOptions}
            onClick={() => {
              setShowDurationOptions((value) => !value);
              setConfirmDelete(false);
            }}
          >
            {showDurationOptions ? "Seçenekleri kapat" : "Planı değiştir"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={generating || deletingPlan}
            aria-expanded={confirmDelete}
            onClick={() => {
              setConfirmDelete((value) => !value);
              setShowDurationOptions(false);
            }}
          >
            <Trash2 aria-hidden="true" />
            Planı sil
          </Button>
        </div>

        {confirmDelete && (
          <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold">Bu planı silmek istediğine emin misin?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Plan uygulamadaki aktif planlarından kaldırılır. Bu işlem yeni bir plan oluşturmaz ve Kaçamak geçmişini geriye dönük değiştirmez.
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" disabled={deletingPlan} onClick={() => setConfirmDelete(false)}>Vazgeç</Button>
              <Button variant="destructive" size="sm" isLoading={deletingPlan} onClick={() => void removePlan()}>Planı sil</Button>
            </div>
          </div>
        )}

        {showDurationOptions && (
          <div className="mt-4 border-t border-border/70 pt-4">
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
              Daha uzun plan seçersen mevcut günlerin bozulmadan korunur ve yalnızca yeni günler eklenir. Yeni plan başarıyla hazırlanana kadar mevcut plan ekranda kalır.
            </p>
            <DurationOptions generating={generating} generatingDuration={generatingDuration} currentPlan={activePlan} />
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Öğün içerikleri yaklaşık besin değerleriyle hazırlanır. Plan yalnızca gıda temellidir; takviye, ilaç veya doz önerisi içermez.
      </p>
    </div>
  );
}
