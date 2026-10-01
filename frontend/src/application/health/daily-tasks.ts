"use client";

import type { DailyTask } from "@/domain/health/types";
import { useMeals, useMealsReadiness } from "@/application/meals/meals-store";
import { useDailyTracking } from "./daily-tracking-store";
import { localCalendarDayDistance, localDayKey } from "./daily-data-readiness";
import { useWeightEntries, WEIGH_IN_INTERVAL_DAYS } from "./weight-store";

/** Reactive hook returning today's tasks without treating unavailable data as zero. */
export function useDailyTasks(): DailyTask[] {
  const meals = useMeals();
  const mealsReadiness = useMealsReadiness();
  const { waterMl, waterGoalMl, waterReadiness, chattedToday } = useDailyTracking();
  const weightEntries = useWeightEntries();

  const hasFoods = (slot: string) =>
    meals.find((meal) => meal.slot === slot)?.foods.length ?? 0;

  const latest = weightEntries.at(-1);
  const today = localDayKey();
  const daysSinceWeigh = latest
    ? (localCalendarDayDistance(latest.date, today) ?? Infinity)
    : Infinity;
  const weighInDue = daysSinceWeigh >= WEIGH_IN_INTERVAL_DAYS;
  const recordedToday = latest?.date === today;

  const tasks: DailyTask[] = [];

  if (mealsReadiness !== "UNKNOWN") {
    tasks.push(
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
    );
  }

  if (waterReadiness !== "UNKNOWN" && waterGoalMl > 0) {
    tasks.push({
      id: "task-water",
      kind: "water",
      label: `Su hedefine ulaş (${(waterGoalMl / 1000).toLocaleString("tr-TR")} L)`,
      done: waterMl >= waterGoalMl,
      icon: "droplet",
    });
  }

  tasks.push({
    id: "task-chat",
    kind: "chat",
    label: "Koçunla bugün sohbet et",
    done: chattedToday,
    icon: "message",
    href: "/ai",
  });

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

export function summarizeTasks(tasks: DailyTask[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}
