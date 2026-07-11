"use client";

import * as React from "react";

import { getGoalTypeMeta, type Goal, type GoalHistoryEntry } from "@/domain/goals/types";

/**
 * Lightweight in-memory goals store shared across routes via useSyncExternalStore.
 * Stands in for a backend/global data layer with no external dependencies; state
 * lives for the browser session only (placeholder behavior).
 */

let uid = 0;
const nextId = () => `goal-${Date.now()}-${uid++}`;
const nextHistoryId = () => `gh-${Date.now()}-${uid++}`;

/** Formats a date offset (in days from today) as an ISO YYYY-MM-DD string. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function history(
  points: Array<{ dayOffset: number; value: number; note?: string }>,
): GoalHistoryEntry[] {
  return points.map((p) => ({
    id: nextHistoryId(),
    date: isoOffset(p.dayOffset),
    value: p.value,
    note: p.note,
  }));
}

function seed(): Goal[] {
  return [
    {
      id: "goal-seed-1",
      type: "lose-weight",
      title: "Yaz için forma gir",
      startValue: 82,
      currentValue: 78.4,
      targetValue: 75,
      startDate: isoOffset(-40),
      targetDate: isoOffset(50),
      reminderTime: "08:00",
      notes: "Haftada 3 kez yürüyüş ve şeker tüketimini azalt.",
      history: history([
        { dayOffset: -40, value: 82, note: "Başlangıç" },
        { dayOffset: -30, value: 81.2 },
        { dayOffset: -20, value: 80.1 },
        { dayOffset: -10, value: 79.2 },
        { dayOffset: -2, value: 78.4, note: "İyi gidiyor" },
      ]),
    },
    {
      id: "goal-seed-2",
      type: "water",
      title: "Günlük su hedefi",
      startValue: 0,
      currentValue: 1800,
      targetValue: 2500,
      startDate: isoOffset(-14),
      targetDate: isoOffset(16),
      reminderTime: "10:00",
      notes: "",
      history: history([
        { dayOffset: -6, value: 1500 },
        { dayOffset: -5, value: 2000 },
        { dayOffset: -4, value: 1700 },
        { dayOffset: -3, value: 2200 },
        { dayOffset: -2, value: 1900 },
        { dayOffset: -1, value: 2100 },
        { dayOffset: 0, value: 1800 },
      ]),
    },
    {
      id: "goal-seed-3",
      type: "steps",
      title: "10 bin adım",
      startValue: 0,
      currentValue: 10200,
      targetValue: 10000,
      startDate: isoOffset(-20),
      targetDate: isoOffset(-1),
      reminderTime: "19:00",
      notes: "Akşam yürüyüşleriyle tamamla.",
      history: history([
        { dayOffset: -6, value: 8200 },
        { dayOffset: -5, value: 9100 },
        { dayOffset: -4, value: 9800 },
        { dayOffset: -3, value: 10500 },
        { dayOffset: -2, value: 9900 },
        { dayOffset: -1, value: 10200, note: "Hedef aşıldı" },
      ]),
    },
    {
      id: "goal-seed-4",
      type: "protein",
      title: "Günlük protein",
      startValue: 0,
      currentValue: 92,
      targetValue: 120,
      startDate: isoOffset(-10),
      targetDate: isoOffset(20),
      reminderTime: "",
      notes: "",
      history: history([
        { dayOffset: -5, value: 80 },
        { dayOffset: -4, value: 88 },
        { dayOffset: -3, value: 95 },
        { dayOffset: -2, value: 90 },
        { dayOffset: -1, value: 92 },
      ]),
    },
  ];
}

let goals: Goal[] = seed();
const listeners = new Set<() => void>();

function emit() {
  goals = [...goals];
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return goals;
}

export interface GoalDraft {
  type: Goal["type"];
  title: string;
  targetValue: number;
  startDate: string;
  targetDate: string;
  reminderTime?: string;
  notes?: string;
}

export const goalsStore = {
  create(draft: GoalDraft): Goal {
    const meta = getGoalTypeMeta(draft.type);
    // Placeholder baseline/current: start neutral so progress reads sensibly.
    const startValue = meta.direction === "decrease" ? draft.targetValue * 1.1 : 0;
    const currentValue = startValue;
    const goal: Goal = {
      id: nextId(),
      type: draft.type,
      title: draft.title.trim() || meta.label,
      startValue,
      currentValue,
      targetValue: draft.targetValue,
      startDate: draft.startDate,
      targetDate: draft.targetDate,
      reminderTime: draft.reminderTime || undefined,
      notes: draft.notes?.trim() || undefined,
      history: [
        { id: nextHistoryId(), date: draft.startDate, value: currentValue, note: "Başlangıç" },
      ],
    };
    goals = [goal, ...goals];
    emit();
    return goal;
  },

  update(id: string, draft: GoalDraft) {
    const meta = getGoalTypeMeta(draft.type);
    goals = goals.map((g) =>
      g.id === id
        ? {
            ...g,
            type: draft.type,
            title: draft.title.trim() || meta.label,
            targetValue: draft.targetValue,
            startDate: draft.startDate,
            targetDate: draft.targetDate,
            reminderTime: draft.reminderTime || undefined,
            notes: draft.notes?.trim() || undefined,
          }
        : g,
    );
    emit();
  },

  remove(id: string) {
    goals = goals.filter((g) => g.id !== id);
    emit();
  },
};

/** Subscribe to the shared goals list. */
export function useGoals(): Goal[] {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe and select a single goal by id (undefined if not found). */
export function useGoal(id: string): Goal | undefined {
  const all = useGoals();
  return all.find((g) => g.id === id);
}
