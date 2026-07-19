"use client";

import * as React from "react";

import type { JourneyEvent } from "@/domain/health/types";

/**
 * In-memory health-journey store. Holds the chronological milestone timeline so
 * the user can answer "what have I achieved?". Placeholder data layer consistent
 * with the other stores; state lives for the browser session only.
 */

let uid = 0;
const nextId = () => `je-${Date.now()}-${uid++}`;

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seed(): JourneyEvent[] {
  return [
    {
      id: nextId(),
      type: "profile-created",
      date: isoOffset(-40),
      title: "Sağlık profili oluşturuldu",
      description: "Hedeflerin ve tercihlerin kaydedildi.",
    },
    {
      id: nextId(),
      type: "first-plan",
      date: isoOffset(-38),
      title: "İlk beslenme planı hazırlandı",
      description: "Yapay zekâ profiline özel bir plan oluşturdu.",
    },
    {
      id: nextId(),
      type: "blood-test",
      date: isoOffset(-30),
      title: "Kan tahlili yüklendi",
      description: "Sonuçların analiz edildi ve sadeleştirildi.",
    },
    {
      id: nextId(),
      type: "weight-updated",
      date: isoOffset(-26),
      title: "Kilo güncellendi: 80,3 kg",
    },
    {
      id: nextId(),
      type: "weight-updated",
      date: isoOffset(-5),
      title: "Kilo güncellendi: 78,4 kg",
      description: "Başlangıçtan bu yana 3,6 kg verdin.",
    },
  ];
}

let events: JourneyEvent[] = seed();
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
