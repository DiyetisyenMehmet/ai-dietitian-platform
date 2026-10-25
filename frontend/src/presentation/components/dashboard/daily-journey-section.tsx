"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Route,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { healthIcon } from "@/presentation/components/health/health-icon";
import {
  summarizeJourney,
  useDailyJourneyResult,
  visibleJourneySteps,
} from "@/application/health/daily-journey";
import type { JourneyResult } from "@/application/health/journey-engine";
import type { JourneyPlannedMeal } from "@/application/health/journey-plan";
import type { JourneyStep } from "@/domain/health/types";
import type { MealSlot } from "@/domain/meals/types";
import { mealsStore, useMeals, useMealsReadiness } from "@/application/meals/meals-store";
import { authStore, useAuth } from "@/application/auth/auth-store";
import { dailyTrackingStore, useDailyTracking } from "@/application/health/daily-tracking-store";
import { localDayKey } from "@/application/health/daily-data-readiness";

export function StepRow({
  step,
  last = false,
  action,
}: {
  step: JourneyStep;
  last?: boolean;
  action?: React.ReactNode;
}) {
  const Icon = healthIcon(step.icon);
  const complete = step.state === "completed";
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
          {step.kind === "water" || step.kind === "weight" || step.kind === "activity"
            ? step.hint
            : complete
              ? "Kaydın hazır"
              : "Hazır olduğunda kaydedebilirsin"}
        </span>
      </span>
      <span
        className={cn(
          action ? "sr-only" : "shrink-0 text-[11px] font-medium",
          complete ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
        )}
      >
        {complete ? "Tamamlandı" : "Bekliyor"}
      </span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
  return (
    <li data-journey-timeline-step data-step-state={step.state} className="relative min-w-0">
      {step.href && !complete && !action ? (
        <Link
          className="block min-h-11 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={step.href}
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
  mealControls?: React.ReactNode;
  feedback?: React.ReactNode;
  waterControls?: React.ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function DailyJourneyContent({
  steps,
  status,
  direction,
  plannedMeal,
  planReady = true,
  mealControls,
  feedback,
  waterControls,
  expanded,
  onExpandedChange,
}: DailyJourneyContentProps) {
  const { completed, total, percent } = summarizeJourney(steps);
  const visible = visibleJourneySteps(steps, status, expanded);
  const next = visibleJourneySteps(steps, status, false).find(
    (step) => step.state === "recommended",
  );
  const detailsId = React.useId();
  const summaries = steps.filter(
    (step) => step.kind === "water" || step.kind === "weight" || step.kind === "activity",
  );
  const list = (expanded ? visible : steps.filter((step) => step.kind !== next?.kind)).filter(
    (step) => !summaries.includes(step),
  );
  const mealIsNext = Boolean(plannedMeal && next && plannedMeal.slot === next.kind);
  const NextIcon = next ? healthIcon(next.icon) : Route;
  return (
    <section
      data-daily-journey-section
      data-journey-status={status}
      data-journey-expanded={String(expanded)}
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
              {total ? `${completed}/${total} adım` : "Veri bekleniyor"}
            </span>
          </div>
          <div className="space-y-2" data-journey-progress-area>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <ProgressBar
                  value={percent}
                  ariaLabel="Günlük yolculuk ilerlemen"
                  ariaValueText={
                    total ? `${completed}/${total} adım tamamlandı` : "Günlük veriler bekleniyor"
                  }
                />
              </div>
              <span className="text-xs font-semibold tabular-nums">
                {total ? `%${percent}` : "—"}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {direction
                ? GOAL_GUIDANCE[direction]
                : "Küçük adımlarını kaydet, günlük ilerlemeni burada takip et."}
            </p>
          </div>
          {status === "all-done" ? (
            <p className="rounded-2xl bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Bugünün yolculuğunu tamamladın! 🎉
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
                    href={next.href!}
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
                        {plannedMeal.meal.time}
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
                        {food.name} <span className="text-muted-foreground">· {food.portion}</span>
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
            <p className="text-xs leading-relaxed text-muted-foreground" data-journey-plan-fallback>
              {planReady
                ? "Bugüne eşleşen bir beslenme planı yok. Öğünlerini yine kaydedebilirsin."
                : "Beslenme planın doğrulanıyor; henüz menü gösterilmiyor."}{" "}
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
                <span>Günlük adımların</span>
                {expanded ? (
                  <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
              <ol
                id={detailsId}
                className={expanded ? "space-y-0.5" : "flex flex-wrap gap-x-3 gap-y-1"}
                data-daily-journey-steps
                data-visible-journey-steps={list.length}
              >
                {list.map((step, index) =>
                  expanded ? (
                    <StepRow
                      key={step.kind}
                      step={step}
                      last={index === list.length - 1 && summaries.length === 0}
                    />
                  ) : (
                    <li
                      key={step.kind}
                      className="flex min-h-8 items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          step.state === "completed" ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                        aria-hidden="true"
                      />
                      {step.label} · {step.state === "completed" ? "Tamamlandı" : "Bekliyor"}
                    </li>
                  ),
                )}
              </ol>
              {summaries.length > 0 && (
                <ol className="space-y-0.5" data-journey-tracking-steps>
                  {summaries.map((step, index) => (
                    <StepRow
                      key={step.kind}
                      step={step}
                      last={index === summaries.length - 1}
                      action={step.kind === "water" ? waterControls : undefined}
                    />
                  ))}
                </ol>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** Local action state is remounted at every account/day boundary. All writes use the existing store. */
function LiveJourney({ result }: { result: ReturnType<typeof useDailyJourneyResult> }) {
  const [expanded, setExpanded] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const locked = React.useRef(false);
  const [message, setMessage] = React.useState("");
  const [savedSlot, setSavedSlot] = React.useState<MealSlot | null>(null);
  const meals = useMeals();
  const readiness = useMealsReadiness();
  const owner = useAuth().user?.id;
  const tracking = useDailyTracking();
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
          : "Öğün kaydedildi. Kalori ve besin değerleri eklenmedi.",
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
              {pending ? "Kaydediliyor…" : "Kaydı geri al"}
            </button>
          ) : meal.foods.length ? (
            <span className="py-2 text-xs text-muted-foreground">Bu öğünde besin kaydın var.</span>
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
            href={`/meals/add?slot=${selected.slot}`}
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
            href={selected.slot ? `/meals/add?slot=${selected.slot}` : "/meals/plan"}
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
      expanded={expanded}
      onExpandedChange={setExpanded}
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
