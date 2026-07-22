"use client";

import * as React from "react";

import type { JourneyStep, JourneyStepKind, JourneyStepState } from "@/domain/health/types";
import { useMeals } from "@/application/meals/meals-store";
import { useDailyTracking } from "./daily-tracking-store";
import { useActivity } from "./activity-store";
import { useWeightEntries, WEIGH_IN_INTERVAL_DAYS } from "./weight-store";

/**
 * The guided "Today's Journey" (Sprint 20). Replaces the flat task checklist
 * with a chronological, coach-led sequence of the day's steps — breakfast,
 * lunch, dinner, water, weight, activity and the AI coach — each carrying a
 * clear state (completed / pending / recommended / skipped).
 *
 * Exactly one still-actionable step is marked "recommended" so the user always
 * knows the single next thing to do. Steps whose time window has passed without
 * completion become "skipped" (never shaming — just an honest state).
 */

function useHour(): number {
  const [hour, setHour] = React.useState<number | null>(null);
  React.useEffect(() => setHour(new Date().getHours()), []);
  return hour ?? 12;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RawStep {
  kind: JourneyStepKind;
  label: string;
  hint: string;
  icon: JourneyStep["icon"];
  href?: string;
  done: boolean;
  /** Its window has passed (used to derive "skipped"). */
  overdue: boolean;
  /** Priority for choosing the single recommended step (lower = sooner). */
  priority: number;
  progress?: number;
}

/** Reactive hook returning today's guided journey steps. */
export function useDailyJourney(): JourneyStep[] {
  const meals = useMeals();
  const { waterMl, waterGoalMl, chattedToday } = useDailyTracking();
  const activity = useActivity();
  const weightEntries = useWeightEntries();
  const hour = useHour();

  return React.useMemo(() => {
    const foodsIn = (slot: string) => meals.find((m) => m.slot === slot)?.foods.length ?? 0;
    const latest = weightEntries.at(-1);
    const daysSinceWeigh = latest
      ? Math.round((Date.now() - new Date(latest.date).getTime()) / 86_400_000)
      : Infinity;
    const weighInDue = daysSinceWeigh >= WEIGH_IN_INTERVAL_DAYS;
    const recordedToday = latest?.date === isoToday();

    const waterRatio = waterGoalMl > 0 ? waterMl / waterGoalMl : 0;
    const activityRatio = activity.stepGoal > 0 ? activity.steps / activity.stepGoal : 0;

    const raw: RawStep[] = [
      {
        kind: "breakfast",
        label: "Kahvaltı",
        hint: "Güne dengeli bir kahvaltıyla başla",
        icon: "sunrise",
        href: "/meals/add",
        done: foodsIn("breakfast") > 0,
        overdue: hour >= 12,
        priority: 1,
      },
      {
        kind: "lunch",
        label: "Öğle yemeği",
        hint: "Öğle öğününü kaydet",
        icon: "sun",
        href: "/meals/add",
        done: foodsIn("lunch") > 0,
        overdue: hour >= 17,
        priority: 2,
      },
      {
        kind: "water",
        label: "Su",
        hint: `${(waterMl / 1000).toLocaleString("tr-TR")} / ${(waterGoalMl / 1000).toLocaleString("tr-TR")} L`,
        icon: "droplet",
        href: "/dashboard",
        done: waterMl >= waterGoalMl,
        overdue: false,
        priority: 3,
        progress: waterRatio,
      },
      {
        kind: "activity",
        label: "Hareket",
        hint: `${activity.steps.toLocaleString("tr-TR")} / ${activity.stepGoal.toLocaleString("tr-TR")} adım`,
        icon: "footprints",
        href: "/dashboard",
        done: activity.steps >= activity.stepGoal,
        overdue: false,
        priority: 4,
        progress: activityRatio,
      },
      {
        kind: "dinner",
        label: "Akşam yemeği",
        hint: "Akşam öğününü ekle",
        icon: "moon",
        href: "/meals/add",
        done: foodsIn("dinner") > 0,
        overdue: hour >= 23,
        priority: 5,
      },
      {
        kind: "coach",
        label: "AI Koç",
        hint: "Koçunla günü değerlendir",
        icon: "message",
        href: "/ai",
        done: chattedToday,
        overdue: false,
        priority: 6,
      },
    ];

    // Weight step only appears when relevant (weigh-in due or already recorded).
    if (weighInDue || recordedToday) {
      raw.push({
        kind: "weight",
        label: "Kilo ölçümü",
        hint: recordedToday ? "Bugün kaydettin" : "Haftalık ölçüm zamanı",
        icon: "scale",
        href: "/progress",
        done: recordedToday,
        overdue: false,
        priority: recordedToday ? 7 : 0, // due weigh-in is high priority
      });
    }

    // Choose the single recommended step: the highest-priority actionable one
    // that is neither done nor overdue.
    const actionable = raw
      .filter((s) => !s.done && !s.overdue)
      .sort((a, b) => a.priority - b.priority);
    const recommendedKind = actionable[0]?.kind;

    const steps: JourneyStep[] = raw
      .sort((a, b) => a.priority - b.priority)
      .map((s) => {
        let state: JourneyStepState;
        if (s.done) state = "completed";
        else if (s.kind === recommendedKind) state = "recommended";
        else if (s.overdue) state = "skipped";
        else state = "pending";
        return {
          kind: s.kind,
          label: s.label,
          hint: s.hint,
          state,
          icon: s.icon,
          href: s.href,
          progress: s.progress,
        };
      });

    return steps;
  }, [meals, waterMl, waterGoalMl, chattedToday, activity, weightEntries, hour]);
}

/** Completion summary (completed vs. total, excluding skipped from the goal). */
export function summarizeJourney(steps: JourneyStep[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = steps.length;
  const completed = steps.filter((s) => s.state === "completed").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}
