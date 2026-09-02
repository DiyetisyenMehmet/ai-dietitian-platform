"use client";

import * as React from "react";

import type { JourneyEvent } from "@/domain/health/types";
import { trackingClient, type WeightLog } from "@/infrastructure/tracking/tracking-client";

/**
 * Health-journey cache.
 *
 * The backend is the single source of truth for the currently implemented
 * timeline source (persisted weight logs). No seeded/demo events are kept.
 */

let uid = 0;
const nextId = () => `je-${Date.now()}-${uid++}`;

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a weight in kilograms using Turkish decimal notation (e.g. 78,4). */
function formatKg(weightKg: number): string {
  return String(weightKg).replace(".", ",");
}

/** Converts a persisted backend weight log into a journey timeline event. */
function toJourneyEvent(log: WeightLog): JourneyEvent {
  return {
    id: log.id,
    type: "weight-updated",
    date: log.loggedAt.slice(0, 10),
    title: `Kilo güncellendi: ${formatKg(log.weightKg)} kg`,
    ...(log.note ? { description: log.note } : {}),
  };
}

let events: JourneyEvent[] = [];
const listeners = new Set<() => void>();

function emit() {
  events = [...events];
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return events;
}

export const journeyStore = {
  /**
   * Hydrates the timeline from persisted backend weight logs. On failure the
   * cache is cleared so another account's stale timeline is never displayed.
   */
  async hydrateJourneyFromBackend(): Promise<void> {
    try {
      const { logs } = await trackingClient.listWeight();
      events = logs.map(toJourneyEvent);
      emit();
    } catch {
      events = [];
      emit();
    }
  },
  /**
   * Adds a transient UI-only milestone. Persisted domains should prefer a
   * backend re-hydration instead of this helper.
   */
  add(event: Omit<JourneyEvent, "id" | "date"> & { date?: string }) {
    events = [
      { id: nextId(), date: event.date ?? isoToday(), ...event },
      ...events,
    ];
    emit();
  },
  reset() {
    events = [];
    emit();
  },
};

/** Subscribe to the journey timeline (newest → oldest). */
export function useJourneyEvents(): JourneyEvent[] {
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return React.useMemo(
    () => [...raw].sort((a, b) => b.date.localeCompare(a.date)),
    [raw],
  );
}
