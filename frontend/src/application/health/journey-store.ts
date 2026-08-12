"use client";

import * as React from "react";

import type { JourneyEvent } from "@/domain/health/types";
import { trackingClient, type WeightLog } from "@/infrastructure/tracking/tracking-client";

/**
 * Health-journey store shared across routes via useSyncExternalStore.
 *
 * The backend is the single source of truth (Sprint 21.3B): the milestone
 * timeline is hydrated from the persisted `/api/tracking/weight` logs via
 * `hydrateJourneyFromBackend` on login / app startup / refresh. This store is a
 * cache only — it holds no seeded/demo events; it starts empty and reflects
 * only what the backend returns.
 */

let uid = 0;
const nextId = () => `je-${Date.now()}-${uid++}`;

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
   * Hydrates the milestone timeline from the backend weight logs (single source
   * of truth). Called on login / app startup / refresh. Best-effort: on a
   * transient failure the last known cache is kept and retried on next mount.
   */
  async hydrateJourneyFromBackend(): Promise<void> {
    try {
      const { logs } = await trackingClient.listWeight();
      events = logs.map(toJourneyEvent);
      emit();
    } catch {
      // Offline / transient failure: keep the last known cache.
    }
  },
  add(event: Omit<JourneyEvent, "id" | "date"> & { date?: string }) {
    events = [
      { id: nextId(), date: event.date ?? isoOffset(0), ...event },
      ...events,
    ];
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
