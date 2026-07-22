"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, SkipForward } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useDailyJourney, summarizeJourney } from "@/application/health/daily-journey";
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
    badge: "Atlandı",
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    iconWrap: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    row: "border-border/60 bg-card hover:bg-accent/40",
  },
};

function StepRow({ step, last }: { step: JourneyStep; last: boolean }) {
  const meta = STATE_META[step.state];
  const Icon = healthIcon(step.icon);
  const clickable = Boolean(step.href) && step.state !== "completed";

  const inner = (
    <div className={cn("flex items-center gap-3 rounded-xl border p-3 transition-colors", meta.row)}>
      {/* Timeline node */}
      <div className="relative flex flex-col items-center self-stretch">
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
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium",
              step.state === "completed" && "text-muted-foreground",
              step.state === "skipped" && "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.badgeClass)}>
            {meta.badge}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.hint}</p>
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
        <Link href={step.href} className="block focus-visible:outline-none">
          {inner}
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}

/**
 * "Today's Journey" — the guided, chronological sequence of the day's steps.
 * Each step clearly signals its state so the user always knows what is done,
 * what is pending, what is recommended next, and what was skipped.
 */
export function DailyJourneySection() {
  const steps = useDailyJourney();
  const { completed, total, percent } = summarizeJourney(steps);
  const allDone = completed === total;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Bugünkü Yolculuğun</h3>
        <span className="text-xs font-medium text-muted-foreground">
          {completed}/{total} adım
        </span>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {allDone ? "Bugünün yolculuğunu tamamladın! 🎉" : "Günlük yolculuğun"}
              </span>
              <span className="font-semibold">%{percent}</span>
            </div>
            <ProgressBar value={percent} />
          </div>
          <ul className="space-y-2">
            {steps.map((step, i) => (
              <StepRow key={step.kind} step={step} last={i === steps.length - 1} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
