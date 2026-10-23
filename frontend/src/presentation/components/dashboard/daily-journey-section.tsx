"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ChevronUp, Route } from "lucide-react";
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

export function StepRow({ step }: { step: JourneyStep; last?: boolean }) {
  const Icon = healthIcon(step.icon);
  const complete = step.state === "completed";
  const body = (
    <div data-journey-row className="flex min-w-0 items-center gap-2.5 rounded-xl py-2">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          complete
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {complete ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Icon className="size-4" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium">{step.label}</span>
        <span className="block break-words text-xs leading-relaxed text-muted-foreground">
          {step.kind === "water" || step.kind === "weight" || step.kind === "activity"
            ? step.hint
            : complete
              ? "Kaydın hazır"
              : "Dilediğinde kaydedebilirsin"}
        </span>
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {complete ? "Tamamlandı" : "Kayıt bekliyor"}
      </span>
    </div>
  );
  return (
    <li>
      {step.href && !complete ? (
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
  return (
    <section
      data-daily-journey-section
      data-journey-status={status}
      data-journey-expanded={String(expanded)}
    >
      <Card
        className="overflow-hidden rounded-[22px] border-primary/15 shadow-sm"
        data-daily-journey-card
      >
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-2.5" data-journey-card-heading>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Route className="size-5" aria-hidden="true" />
            </span>
            <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight">
              Bugünkü Yolculuğum
            </h3>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
              {total ? `${completed}/${total} adım` : "Veri bekleniyor"}
            </span>
          </div>
          <div className="space-y-2" data-journey-progress-area>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <ProgressBar value={percent} />
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
            <p className="rounded-xl bg-emerald-500/10 p-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">
              Bugünün yolculuğunu tamamladın! 🎉
            </p>
          ) : next ? (
            <div
              className="rounded-2xl border border-primary/20 bg-primary/5 p-3"
              data-journey-next
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                Sıradaki adım
              </p>
              <Link
                href={next.href!}
                className="flex min-h-11 items-center justify-between gap-2 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  {next.label}
                  {!plannedMeal || plannedMeal.slot !== next.kind ? " kaydını ekle" : ""}
                </span>
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {next.kind === "weight" ? next.hint : "Hazır olduğunda kaydedebilirsin."}
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              {status === "insufficient-data"
                ? "Bazı takip verileri henüz hazır değil. Verilerin geldikçe yolculuğun güncellenecek."
                : "Günlük kayıtlarını burada takip edebilirsin."}
            </p>
          )}
          {plannedMeal ? (
            <div
              className="space-y-2 rounded-2xl border border-border bg-muted/20 p-3"
              data-journey-plan-meal
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Bugünkü beslenme planından
                  </p>
                  <h4 className="mt-0.5 break-words text-sm font-semibold">
                    {plannedMeal.meal.name}
                  </h4>
                </div>
                <time className="shrink-0 rounded-lg bg-card px-2 py-1 text-sm font-semibold tabular-nums">
                  {plannedMeal.meal.time}
                </time>
              </div>
              <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {plannedMeal.meal.foods.map((food, i) => (
                  <li className="break-words" key={i}>
                    {food.name} · {food.portion}
                  </li>
                ))}
              </ul>
              {mealControls}
            </div>
          ) : (
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
          {summaries.length > 0 && (
            <ul className="divide-y divide-border/60 border-y border-border/60">
              {summaries.map((step) => (
                <React.Fragment key={step.kind}>
                  <StepRow step={step} />
                  {step.kind === "water" && waterControls && (
                    <li className="pb-2">{waterControls}</li>
                  )}
                </React.Fragment>
              ))}
            </ul>
          )}
          {steps.length > 0 && (
            <div>
              <button
                type="button"
                aria-label={expanded ? "Yolculuk detaylarını daralt" : "Yolculuk detaylarını aç"}
                aria-expanded={expanded}
                aria-controls={detailsId}
                data-journey-details-toggle
                onClick={() => onExpandedChange(!expanded)}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{expanded ? "Detayları gizle" : "Günlük adımların"}</span>
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              <ul
                id={detailsId}
                className={
                  expanded ? "divide-y divide-border/50" : "flex flex-wrap gap-x-3 gap-y-1"
                }
                data-daily-journey-steps
                data-visible-journey-steps={list.length}
              >
                {list
                  .filter((step) => !expanded || !summaries.includes(step))
                  .map((step) =>
                    expanded ? (
                      <StepRow key={step.kind} step={step} />
                    ) : (
                      <li
                        key={step.kind}
                        className="flex min-h-8 items-center gap-1.5 text-[11px] text-muted-foreground"
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            step.state === "completed"
                              ? "bg-emerald-500"
                              : "bg-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        />
                        {step.label} · {step.state === "completed" ? "Tamamlandı" : "Bekliyor"}
                      </li>
                    ),
                  )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** Local action state is remounted at every account/day boundary. All writes use the existing store. */
function LiveJourney({ result }: { result: ReturnType<typeof useDailyJourneyResult> }) {
  const [expanded, setExpanded] = React.useState(false);
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
    "flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
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
        <div className="flex flex-wrap gap-2">
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
          className={cn(buttonClass, "w-full bg-primary/10 text-primary")}
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
