"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Clock3, Route, UtensilsCrossed } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { healthIcon } from "@/presentation/components/health/health-icon";
import {
  summarizeJourney,
  useDailyJourneyResult,
  visibleJourneySteps,
  journeyDisclosure,
  settleJourneyDisclosure,
} from "@/application/health/daily-journey";
import type { JourneyResult } from "@/application/health/journey-engine";
import type { JourneyPlannedMeal } from "@/application/health/journey-plan";
import type { JourneyStep } from "@/domain/health/types";
import type { MealSlot } from "@/domain/meals/types";
import { mealsStore, useMeals, useMealsReadiness } from "@/application/meals/meals-store";
import { authStore, useAuth } from "@/application/auth/auth-store";
import { dailyTrackingStore, useDailyTracking } from "@/application/health/daily-tracking-store";
import { localDayKey } from "@/application/health/daily-data-readiness";

function journeyHref(href: string, day?: string) {
  return day && href.startsWith("/meals/add?slot=")
    ? `${href}&day=${day}&returnTo=/dashboard`
    : href;
}

export function StepRow({
  step,
  last = false,
  action,
  day,
}: {
  step: JourneyStep;
  last?: boolean;
  action?: React.ReactNode;
  day?: string;
}) {
  const Icon = healthIcon(step.icon);
  const complete = step.state === "completed";
  const addFoodHref =
    complete && step.hint === "Öğün işaretlendi; besin kaydı yok" && step.href
      ? journeyHref(step.href, day)
      : null;
  const rowAction =
    action ??
    (addFoodHref ? (
      <Link
        href={addFoodHref}
        aria-label={`${step.label} için besin kaydı ekle`}
        className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Besin ekle
      </Link>
    ) : null);
  const body = (
    <div data-journey-row className="flex min-w-0 items-center gap-3 py-2.5">
      <span className="relative flex shrink-0 items-start self-stretch pt-1">
        {!last && (
          <span
            aria-hidden="true"
            className="absolute bottom-[-22px] left-4 top-9 border-l border-border"
          />
        )}
        <span
          className={cn(
            "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card",
            complete
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-border text-muted-foreground",
          )}
        >
          {complete ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Icon className="size-4" aria-hidden="true" />
          )}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold">{step.label}</span>
        <span className="mt-0.5 block break-words text-xs leading-relaxed text-muted-foreground">
          {step.hint}
        </span>
      </span>
      <span
        className={cn(
          rowAction ? "sr-only" : "shrink-0 text-[11px] font-medium",
          complete ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
        )}
      >
        {complete ? "Tamamlandı" : step.kind === "planned-meal" ? "Takip dışı" : "Bekliyor"}
      </span>
      {rowAction && <span className="shrink-0">{rowAction}</span>}
    </div>
  );
  return (
    <li data-journey-timeline-step data-step-state={step.state} className="relative min-w-0">
      {step.href && !complete && !action ? (
        <Link
          className="block min-h-11 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={journeyHref(step.href, day)}
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

const GOAL_GUIDANCE = {
  lose: "Kilo verme hedefin için küçük, düzenli adımlarla ilerle.",
  gain: "Kilo alma hedefin için öğünlerini ve günlük kayıtlarını takip et.",
  maintain: "Kilonu koruma hedefin için sana iyi gelen düzeni sürdür.",
};

interface DailyJourneyContentProps {
  steps: JourneyStep[];
  status: JourneyResult["status"];
  direction?: JourneyResult["direction"];
  plannedMeal?: JourneyPlannedMeal | null;
  planReady?: boolean;
  planReadError?: boolean;
  planRefreshing?: boolean;
  mealControls?: React.ReactNode;
  feedback?: React.ReactNode;
  waterControls?: React.ReactNode;
  day?: string;
  progressReady?: boolean;
  outerExpanded?: boolean;
  onOuterExpandedChange?: (expanded: boolean) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function DailyJourneyContent({
  steps,
  status,
  direction,
  plannedMeal,
  planReady = true,
  planReadError = false,
  planRefreshing = false,
  mealControls,
  feedback,
  waterControls,
  day,
  progressReady = true,
  outerExpanded = true,
  onOuterExpandedChange,
  expanded,
  onExpandedChange,
}: DailyJourneyContentProps) {
  const { completed, total, percent } = summarizeJourney(steps);
  const next = visibleJourneySteps(steps, status, false).find(
    (step) => step.state === "recommended",
  );
  const detailsId = React.useId();
  const bodyId = React.useId();
  const summaries = steps.filter(
    (step) => step.kind === "water" || step.kind === "weight" || step.kind === "activity",
  );
  const unmatched = steps.filter((step) => step.kind === "planned-meal");
  const scopedTracking = unmatched.length > 0;
  const list = steps.filter((step) => !summaries.includes(step) && !unmatched.includes(step));
  const mealIsNext = Boolean(
    plannedMeal && next && (next.id ? plannedMeal.key === next.id : plannedMeal.slot === next.kind),
  );
  const NextIcon = next ? healthIcon(next.icon) : Route;
  return (
    <section
      data-daily-journey-section
      data-journey-status={status}
      data-journey-expanded={String(expanded)}
      data-journey-outer-expanded={String(outerExpanded)}
    >
      <Card
        className="overflow-hidden rounded-[24px] border-primary/15 bg-card shadow-sm"
        data-daily-journey-card
      >
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-2.5" data-journey-card-heading>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Route className="size-5" aria-hidden="true" />
            </span>
            <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight sm:text-lg">
              Bugünkü Yolculuğum
            </h3>
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-primary">
              {!progressReady
                ? "Doğrulanıyor"
                : status === "all-done"
                  ? scopedTracking
                    ? "Takip tamamlandı ✓"
                    : "Tamamlandı ✓"
                  : total
                    ? scopedTracking
                      ? `${completed}/${total} takip`
                      : `${completed}/${total} adım`
                    : "Veri bekleniyor"}
            </span>
            <button
              type="button"
              data-journey-outer-toggle
              aria-expanded={outerExpanded}
              aria-controls={bodyId}
              aria-label={
                outerExpanded
                  ? "Bugünkü Yolculuğum bölümünü daralt"
                  : "Bugünkü Yolculuğum bölümünü aç"
              }
              onClick={() => onOuterExpandedChange?.(!outerExpanded)}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-5 transition-transform motion-reduce:transition-none",
                  outerExpanded && "rotate-180",
                )}
              />
            </button>
          </div>
          <div id={bodyId} hidden={!outerExpanded} className="space-y-3" data-journey-body>
            {(planReadError || planRefreshing) && (
              <p role="status" className="text-sm text-muted-foreground">
                {planReadError
                  ? "Plan yenilenemedi. Son doğrulanmış veri varsa korunuyor."
                  : "Plan güncelleniyor…"}
              </p>
            )}
            {status === "all-done" ? (
              <p className="rounded-2xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {scopedTracking
                  ? "Takip edilebilir kayıt hedeflerini tamamladın. Eşleştirilemeyen plan öğünleri bu ilerlemeye dahil değil ve tamamlanmış sayılmadı. Kalori ve besin hedeflerin ayrı takip edilir."
                  : "Günlük kayıt adımlarını tamamladın! Kalori ve besin hedeflerin ayrı takip edilir."}
              </p>
            ) : next || plannedMeal ? (
              <div
                className="space-y-4 rounded-[20px] border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-card p-4 sm:p-5"
                data-journey-next={next ? "" : undefined}
                data-journey-focus-card
              >
                {next && !mealIsNext && (
                  <div className={plannedMeal ? "border-b border-primary/15 pb-3" : ""}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      Sıradaki adım
                    </p>
                    <Link
                      href={journeyHref(next.href!, day)}
                      className="flex min-h-12 items-center gap-3 rounded-xl text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <NextIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 break-words">
                        {next.label}
                        {!plannedMeal ? " kaydını ekle" : ""}
                      </span>
                      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                    </Link>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {next.kind === "weight" ? next.hint : "Hazır olduğunda kaydedebilirsin."}
                    </p>
                  </div>
                )}
                {plannedMeal && (
                  <div className="space-y-4" data-journey-plan-meal>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          {mealIsNext ? "Sıradaki adım" : "Bugünkü beslenme planından"}
                        </p>
                        <h4 className="mt-1.5 break-words text-xl font-semibold tracking-tight">
                          {plannedMeal.meal.name}
                        </h4>
                        <time
                          dateTime={plannedMeal.meal.time}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-card/80 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary"
                        >
                          <Clock3 className="size-3.5" aria-hidden="true" />
                          Planlanan {plannedMeal.meal.time}
                        </time>
                      </div>
                      <span
                        role="img"
                        aria-label="Öğün planı simgesi"
                        data-journey-meal-illustration
                        className="flex size-16 shrink-0 items-center justify-center rounded-[20px] border border-primary/10 bg-card/80 text-primary sm:size-20"
                      >
                        <UtensilsCrossed
                          className="size-8 sm:size-10"
                          aria-hidden="true"
                          strokeWidth={1.5}
                        />
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
                      {plannedMeal.meal.foods.map((food, i) => (
                        <li className="break-words" key={i}>
                          {food.name}{" "}
                          <span className="text-muted-foreground">· {food.portion}</span>
                        </li>
                      ))}
                    </ul>
                    {mealControls}
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-2xl bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                {status === "insufficient-data"
                  ? "Bazı takip verileri henüz hazır değil. Verilerin geldikçe yolculuğun güncellenecek."
                  : "Günlük kayıtlarını burada takip edebilirsin."}
              </p>
            )}
            {!plannedMeal && status !== "all-done" && (
              <p
                className="text-xs leading-relaxed text-muted-foreground"
                data-journey-plan-fallback
              >
                {planReadError
                  ? "Beslenme planın doğrulanamadı. Plan ekranından tekrar deneyebilirsin."
                  : !planReady
                    ? "Beslenme planın doğrulanıyor; henüz menü gösterilmiyor."
                    : scopedTracking
                      ? "Takip edilebilir öğün adımlarını aşağıdan kontrol edebilirsin. Eşleştirilemeyen plan öğünleri ayrıca gösterilir."
                      : steps.some((step) => step.id)
                        ? "Bugünkü planın öğün adımları kaydedildi. Diğer günlük adımlarını aşağıdan takip edebilirsin."
                        : "Bugüne eşleşen bir beslenme planı yok. Öğünlerini yine kaydedebilirsin."}{" "}
                <Link
                  href="/meals/plan"
                  className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
                >
                  Planına bak
                </Link>
              </p>
            )}
            {feedback}
            {steps.length > 0 && (
              <div className="border-t border-border/70 pt-1">
                <button
                  type="button"
                  aria-label={expanded ? "Yolculuk detaylarını daralt" : "Yolculuk detaylarını aç"}
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  data-journey-details-toggle
                  onClick={() => onExpandedChange(!expanded)}
                  className="mb-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    Günlük adımlarım{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {completed}/{total}
                      {scopedTracking ? " takip" : ""}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
                <div
                  id={detailsId}
                  hidden={!expanded}
                  className="space-y-3"
                  data-journey-details-panel
                >
                  <div className="space-y-2" data-journey-progress-area>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <ProgressBar
                          value={percent}
                          ariaLabel={
                            scopedTracking
                              ? "Takip edilebilir kayıt hedeflerindeki ilerlemen"
                              : "Günlük yolculuk ilerlemen"
                          }
                          ariaValueText={
                            total
                              ? `${completed}/${total} ${scopedTracking ? "takip hedefi" : "adım"} tamamlandı`
                              : "Günlük veriler bekleniyor"
                          }
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums">
                        {progressReady && total ? `%${percent}` : "—"}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {direction
                        ? GOAL_GUIDANCE[direction]
                        : "Küçük adımlarını kaydet, günlük ilerlemeni burada takip et."}
                    </p>
                  </div>
                  <ol
                    className="space-y-0.5"
                    data-daily-journey-steps
                    data-visible-journey-steps={expanded ? list.length : 0}
                  >
                    {list.map((step, index, items) => (
                      <StepRow
                        key={step.id ?? step.kind}
                        step={step}
                        day={day}
                        last={
                          index === items.length - 1 && summaries.length === 0 && !scopedTracking
                        }
                      />
                    ))}
                  </ol>
                  {summaries.length > 0 && (
                    <ol className="space-y-0.5" data-journey-tracking-steps>
                      {summaries.map((step, index) => (
                        <StepRow
                          key={step.id ?? step.kind}
                          step={step}
                          day={day}
                          last={index === summaries.length - 1}
                          action={step.kind === "water" ? waterControls : undefined}
                        />
                      ))}
                    </ol>
                  )}
                  {scopedTracking && (
                    <div data-journey-unmatched-plan className="border-t border-border/70 pt-3">
                      <p className="text-sm font-semibold">Eşleştirilemeyen plan öğünleri</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Bu {unmatched.length} öğün tekil bir tüketim kaydıyla eşleşmiyor. Takip
                        hedeflerine dahil değil; tamamlanmış sayılmadı. Kayıtlar bu öğünlere
                        otomatik dağıtılmaz.
                      </p>
                      <ol className="mt-2 space-y-0.5">
                        {unmatched.map((step, index) => (
                          <StepRow
                            key={step.id}
                            step={step}
                            day={day}
                            last={index === unmatched.length - 1}
                          />
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/** Local action state is remounted at every account/day boundary. All writes use the existing store. */
function LiveJourney({ result }: { result: ReturnType<typeof useDailyJourneyResult> }) {
  const meals = useMeals();
  const readiness = useMealsReadiness();
  const tracking = useDailyTracking();
  const storageKey = `diewish:journey-view:${encodeURIComponent(useAuth().user?.id ?? "guest")}:${result.dayKey}`;
  const [preference, setPreference] = React.useState(() => {
    try {
      return journeyDisclosure(
        typeof window === "undefined"
          ? null
          : JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      );
    } catch {
      return journeyDisclosure(null);
    }
  });
  const completed = result.status === "all-done" && result.planReady;
  const settled = settleJourneyDisclosure(preference, completed);
  const outerExpanded =
    settled.outer ??
    (result.planReady && readiness !== "UNKNOWN" && tracking.waterReadiness !== "UNKNOWN");
  const expanded = settled.inner;
  React.useEffect(() => {
    if (!result.dayKey) return;
    if (settled !== preference) setPreference(settled);
    try {
      localStorage.setItem(storageKey, JSON.stringify(settled));
    } catch {
      /* UI preference only. */
    }
  }, [storageKey, result.dayKey, preference, settled]);
  const [pending, setPending] = React.useState(false);
  const locked = React.useRef(false);
  const [message, setMessage] = React.useState("");
  const [savedSlot, setSavedSlot] = React.useState<MealSlot | null>(null);
  const owner = useAuth().user?.id;
  const selected = result.plannedMeal;
  const meal = meals.find((entry) => entry.slot === selected?.slot);
  const saved = meals.find((entry) => entry.slot === savedSlot && entry.checkInId && entry.isEaten);
  const buttonClass =
    "flex min-h-12 min-w-11 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  async function record(slot: MealSlot, undo = false) {
    if (
      locked.current ||
      readiness === "UNKNOWN" ||
      authStore.getSnapshot().user?.id !== owner ||
      localDayKey() !== result.dayKey
    )
      return;
    locked.current = true;
    setPending(true);
    setMessage("");
    try {
      if (undo) await mealsStore.unmarkMealEaten(slot);
      else await mealsStore.markMealEaten(slot);
      if (authStore.getSnapshot().user?.id !== owner || localDayKey() !== result.dayKey) return;
      const persisted = mealsStore.getSnapshot().find((entry) => entry.slot === slot);
      if (!undo && !persisted?.checkInId) throw new Error("Missing confirmation");
      setSavedSlot(undo ? null : slot);
      setMessage(
        undo
          ? "Öğün işareti geri alındı."
          : "Öğün adımı işaretlendi; besin kaydı henüz oluşturulmadı. Kalori ve besin değerleri eklenmedi.",
      );
    } catch {
      if (authStore.getSnapshot().user?.id === owner && localDayKey() === result.dayKey)
        setMessage("İşlem tamamlanamadı. Lütfen tekrar dene.");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  async function addWater() {
    if (
      locked.current ||
      tracking.waterReadiness === "UNKNOWN" ||
      tracking.dayKey !== result.dayKey ||
      localDayKey() !== result.dayKey ||
      authStore.getSnapshot().user?.id !== owner
    )
      return;
    locked.current = true;
    setPending(true);
    setMessage("");
    try {
      const log = await dailyTrackingStore.addWater(250);
      if (authStore.getSnapshot().user?.id === owner && localDayKey() === result.dayKey && log.id)
        setMessage("250 ml su kaydedildi.");
    } catch {
      if (authStore.getSnapshot().user?.id === owner && localDayKey() === result.dayKey)
        setMessage("Su kaydedilemedi. Lütfen tekrar dene.");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  const controls = selected && (
    <>
      {selected.slot && readiness !== "UNKNOWN" && meal ? (
        <div className="grid grid-cols-2 gap-2" data-journey-meal-actions>
          {meal.isEaten ? (
            <button
              type="button"
              disabled={pending || !meal.checkInId}
              onClick={() => void record(meal.slot, true)}
              className={cn(buttonClass, "bg-primary/10 text-primary")}
            >
              {pending ? "Kaydediliyor…" : "İşareti geri al"}
            </button>
          ) : meal.foods.length ? (
            <span className="py-2 text-xs text-muted-foreground">
              Bu öğünde besin kaydın var; kalori toplamına dahil.
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => void record(meal.slot)}
              className={cn(buttonClass, "bg-primary text-primary-foreground")}
            >
              {pending ? "Kaydediliyor…" : "Yedim"}
            </button>
          )}
          <Link
            href={`/meals/add?slot=${selected.slot}&day=${result.dayKey}&returnTo=/dashboard`}
            className={cn(buttonClass, "border border-border bg-card")}
          >
            Farklı yedim
          </Link>
        </div>
      ) : (
        <div className="text-xs leading-relaxed text-muted-foreground">
          <p>
            {readiness === "UNKNOWN"
              ? "Öğün kayıtları doğrulanamadı. Kayıt ekranından devam edebilirsin."
              : "Bu öğün tek bir kayıt türüyle eşleşmiyor. Planından kontrol edebilirsin."}
          </p>
          <Link
            className={cn(buttonClass, "mt-2 border border-border")}
            href={
              selected.slot
                ? `/meals/add?slot=${selected.slot}&day=${result.dayKey}&returnTo=/dashboard`
                : "/meals/plan"
            }
          >
            Öğün kaydına git
          </Link>
        </div>
      )}
    </>
  );
  return (
    <DailyJourneyContent
      {...result}
      day={result.dayKey ?? undefined}
      status={result.planReady ? result.status : "insufficient-data"}
      progressReady={
        result.planReady &&
        (result.status === "all-done" ||
          (readiness !== "UNKNOWN" && tracking.waterReadiness !== "UNKNOWN"))
      }
      outerExpanded={outerExpanded}
      onOuterExpandedChange={(outer) => setPreference({ ...settled, outer })}
      expanded={expanded}
      onExpandedChange={(inner) => setPreference({ ...settled, inner })}
      mealControls={controls}
      waterControls={
        <button
          type="button"
          disabled={pending || tracking.waterReadiness === "UNKNOWN"}
          onClick={() => void addWater()}
          className={cn(buttonClass, "bg-primary/10 text-primary")}
        >
          {pending ? "Kaydediliyor…" : "+250 ml su ekle"}
        </button>
      }
      feedback={
        <div aria-live="polite" aria-atomic="true">
          {message && <p className="text-xs leading-relaxed">{message}</p>}
          {saved && saved.slot !== selected?.slot && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void record(saved.slot, true)}
              className={cn(buttonClass, "text-primary underline")}
            >
              Son öğün işaretini geri al
            </button>
          )}
        </div>
      }
    />
  );
}

export function DailyJourneySection() {
  const result = useDailyJourneyResult();
  const { user } = useAuth();
  return <LiveJourney key={`${user?.id ?? "guest"}:${result.dayKey}`} result={result} />;
}
