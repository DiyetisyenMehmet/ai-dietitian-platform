"use client";

import type { DailyTask } from "@/domain/health/types";
import { useMeals } from "@/application/meals/meals-store";
import { useDailyTracking } from "./daily-tracking-store";
import { useWeightEntries, WEIGH_IN_INTERVAL_DAYS } from "./weight-store";

/**
 * Derives today's dynamic task list from the user's real (session) activity:
 * logged meals, water intake, coach conversation and weigh-in cadence. Tasks
 * change as the user interacts — completed ones are checked off automatically.
 */

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reactive hook returning today's tasks. */
export function useDailyTasks(): DailyTask[] {
  const meals = useMeals();
  const { waterMl, waterGoalMl, chattedToday } = useDailyTracking();
  const weightEntries = useWeightEntries();

  const hasFoods = (slot: string) =>
    meals.find((m) => m.slot === slot)?.foods.length ?? 0;

  const latest = weightEntries.at(-1);
  const daysSinceWeigh = latest
    ? Math.round((Date.now() - new Date(latest.date).getTime()) / 86_400_000)
    : Infinity;
  const weighInDue = daysSinceWeigh >= WEIGH_IN_INTERVAL_DAYS;
  const recordedToday = latest?.date === isoToday();

  const tasks: DailyTask[] = [
    {
      id: "task-breakfast",
      kind: "breakfast",
      label: "Kahvaltını ekle",
      done: hasFoods("breakfast") > 0,
      icon: "sunrise",
      href: "/meals/add",
    },
    {
      id: "task-lunch",
      kind: "lunch",
      label: "Öğle yemeğini tamamla",
      done: hasFoods("lunch") > 0,
      icon: "sun",
      href: "/meals/add",
    },
    {
      id: "task-dinner",
      kind: "dinner",
      label: "Akşam yemeğini ekle",
      done: hasFoods("dinner") > 0,
      icon: "moon",
      href: "/meals/add",
    },
    {
      id: "task-water",
      kind: "water",
      label: `Su hedefine ulaş (${(waterGoalMl / 1000).toLocaleString("tr-TR")} L)`,
      done: waterMl >= waterGoalMl,
      icon: "droplet",
    },
    {
      id: "task-chat",
      kind: "chat",
      label: "Koçunla bugün sohbet et",
      done: chattedToday,
      icon: "message",
      href: "/ai",
    },
  ];

  // Weight task only appears when a weigh-in is due (dynamic behavior).
  if (weighInDue || recordedToday) {
    tasks.push({
      id: "task-weight",
      kind: "weight",
      label: recordedToday ? "Kilonu kaydettin" : "Bugün kilonu kaydet",
      done: recordedToday,
      icon: "scale",
      href: "/progress",
    });
  }

  return tasks;
}

/** Completion summary for a task list. */
export function summarizeTasks(tasks: DailyTask[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}
