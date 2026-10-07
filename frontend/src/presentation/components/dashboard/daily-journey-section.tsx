"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ChevronUp, SkipForward } from "lucide-react";

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
import type { JourneyStep, JourneyStepState } from "@/domain/health/types";

const STATE_META: Record<
  JourneyStepState,
  { badge: string; badgeClass: string; iconWrap: string; row: string }
> = {
  completed: {
    badge: "Tamamlandı",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    iconWrap: "bg-emerald-500 text-white",
    row: "border-transparent bg-muted/40",
  },
  recommended: {
    badge: "Önerilen",
    badgeClass: "bg-primary/15 text-primary",
    iconWrap: "bg-primary text-primary-foreground",
    row: "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
  },
  pending: {
    badge: "Bekliyor",
    badgeClass: "bg-muted text-muted-foreground",
    iconWrap: "bg-primary/10 text-primary",
    row: "border-border bg-card hover:bg-accent/40",
  },
  skipped: {
    badge: "Kayıt zamanı geçti",
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    iconWrap: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    row: "border-border/60 bg-card hover:bg-accent/40",
  },
};

export function StepRow({ step, last }: { step: JourneyStep; last: boolean }) {
  const meta = STATE_META[step.state];
  const Icon = healthIcon(step.icon);
  const clickable = Boolean(step.href) && step.state !== "completed";

  const inner = (
    <div
      data-journey-row
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:gap-2.5 sm:p-2.5",
        meta.row,
      )}
    >
      <div className="relative flex shrink-0 flex-col items-center self-stretch">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            meta.iconWrap,
          )}
        >
          {step.state === "completed" ? (
            <Check className="size-5" aria-hidden="true" />
          ) : step.state === "skipped" ? (
            <SkipForward className="size-[18px]" aria-hidden="true" />
          ) : (
            <Icon className="size-[18px]" aria-hidden="true" />
          )}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "min-w-0 break-words text-sm font-medium leading-normal [overflow-wrap:anywhere]",
              step.state === "completed" && "text-muted-foreground",
              step.state === "skipped" && "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          <span
            className={cn(
              "max-w-full break-words rounded-full px-2 py-0.5 text-[10px] font-semibold [overflow-wrap:anywhere]",
              meta.badgeClass,
            )}
          >
            {meta.badge}
          </span>
        </div>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {step.hint}
        </p>
        {typeof step.progress === "number" && step.state !== "completed" && (
          <div className="mt-1.5">
            <ProgressBar value={Math.round(step.progress * 100)} />
          </div>
        )}
      </div>

      {clickable && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );

  if (clickable && step.href) {
    return (
      <li>
        <Link
          href={step.href}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {inner}
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}

interface DailyJourneyContentProps {
  steps: JourneyStep[];
  status: JourneyResult["status"];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export function DailyJourneyContent({
  steps,
  status,
  expanded,
  onExpandedChange,
}: DailyJourneyContentProps) {
  const { completed, total, percent } = summarizeJourney(steps);
  const allDone = status === "all-done";
  const insufficientData = status === "insufficient-data";
  const noActionableStep = status === "no-actionable-step";
  const visibleSteps = visibleJourneySteps(steps, status, expanded);
  const canToggleDetails = steps.length > 0 && (expanded || visibleSteps.length !== steps.length);
  const detailsId = "daily-journey-steps";
  const detailsControl = canToggleDetails ? (
    <button
      type="button"
      aria-label={expanded ? "Yolculuk detaylarını daralt" : "Yolculuk detaylarını aç"}
      aria-expanded={expanded}
      aria-controls={detailsId}
      data-journey-details-toggle
      onClick={() => onExpandedChange(!expanded)}
      className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {expanded ? (
        <ChevronUp className="size-4" aria-hidden="true" />
      ) : (
        <ChevronDown className="size-4" aria-hidden="true" />
      )}
    </button>
  ) : null;

  return (
    <section
      className="space-y-0"
      data-daily-journey-section
      data-journey-status={status}
      data-journey-expanded={expanded ? "true" : "false"}
    >
      <Card className="rounded-[22px]" data-daily-journey-card>
        <CardContent className="space-y-1.5 p-2 sm:space-y-2 sm:p-2.5">
          <div
            className="flex min-w-0 items-center justify-between gap-2"
            data-journey-card-heading
          >
            <h3 className="min-w-0 text-base font-semibold leading-tight">
              Bugünkü Yolculuğum
            </h3>
            <span className="shrink-0 text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
              {insufficientData ? "Veri bekleniyor" : `${completed}/${total} adım`}
            </span>
          </div>

          {insufficientData ? (
            <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-2 sm:p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Bugünkü öneriyi netleştirmek için bazı takip verileri henüz hazır değil.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Verilerin geldikçe yolculuğun otomatik güncellenecek.
                </p>
              </div>
              {detailsControl}
            </div>
          ) : (
            <div className="flex items-center gap-1.5" data-journey-progress-area>
              <div className="min-w-0 max-w-md flex-1">
                {allDone && (
                  <p className="mb-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">
                    Bugünün yolculuğunu tamamladın! 🎉
                  </p>
                )}
                {noActionableStep && (
                  <p className="mb-1 text-xs leading-relaxed text-muted-foreground">
                    Şu an açılacak yeni bir adım yok. Günlük ilerlemeni burada takip edebilirsin.
                  </p>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ProgressBar value={percent} />
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold leading-none sm:text-xs">
                    %{percent}
                  </span>
                </div>
              </div>
              {detailsControl}
            </div>
          )}

          {(visibleSteps.length > 0 || canToggleDetails) && (
            <ul
              id={detailsId}
              hidden={visibleSteps.length === 0}
              className="space-y-1.5 sm:space-y-2"
              data-daily-journey-steps
              data-visible-journey-steps={visibleSteps.length}
            >
              {visibleSteps.map((step, index) => (
                <StepRow key={step.kind} step={step} last={index === visibleSteps.length - 1} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * "Today's Journey" keeps the engine as the only decision source. The dashboard
 * collapses the presentation to the next meaningful step and expands the same
 * StepRow list on demand.
 */
export function DailyJourneySection() {
  const { steps, status } = useDailyJourneyResult();
  const [expanded, setExpanded] = React.useState(false);

  return (
    <DailyJourneyContent
      steps={steps}
      status={status}
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}
