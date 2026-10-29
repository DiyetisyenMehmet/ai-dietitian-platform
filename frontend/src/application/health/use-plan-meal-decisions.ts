"use client";

import * as React from "react";
import { ApiError } from "@/infrastructure/api/http-client";
import { mealCheckInsClient } from "@/infrastructure/tracking/meal-check-ins-client";
import { authStore } from "@/application/auth/auth-store";
import { localDayKey } from "./daily-data-readiness";
import type { JourneyPlannedMeal } from "./journey-plan";
import type { PlanMealDecisions, PlanMealState } from "./plan-meal-decisions";

export function usePlanMealDecisions(meals: JourneyPlannedMeal[], owner: string | undefined, day: string | null) {
  const scope = JSON.stringify([owner, day, meals.map(m => [m.key, m.identity, m.meal.time])]);
  const current = React.useRef(scope);
  current.current = scope;
  const locked = React.useRef(false);
  const request = React.useRef<AbortController | null>(null);
  const generation = React.useRef(0);
  const [snapshot, setSnapshot] = React.useState<{ scope: string; values: PlanMealDecisions | null; message: string }>({ scope: "", values: null, message: "" });
  const [busy, setBusy] = React.useState(false);
  const owns = React.useCallback(() => current.current === scope && Boolean(owner) && authStore.getSnapshot().user?.id === owner && localDayKey() === day, [scope, owner, day]);
  const refresh = React.useCallback(async (message = "") => {
    if (!owns() || !meals.length) return;
    const sequence = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const values = await mealCheckInsClient.read(meals, controller.signal);
      if (owns() && sequence === generation.current) setSnapshot({ scope, values, message });
    } catch (error) {
      if (controller.signal.aborted || !owns() || sequence !== generation.current) return;
      setSnapshot({ scope, values: null, message: error instanceof ApiError && error.status === 409
        ? "Plan değişmiş. Güncel planı kontrol et."
        : "Öğün takibi şu anda kullanılamıyor. Kayıt doğrulanmadı; tekrar okuyabilirsin." });
    }
  }, [scope, owns, meals]);
  React.useEffect(() => {
    locked.current = false;
    setBusy(false);
    if (meals.length) void refresh();
    const resume = () => { if (!locked.current && document.visibilityState !== "hidden") void refresh(); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = setInterval(resume, 30_000);
    return () => { generation.current++; request.current?.abort(); clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [refresh, meals.length]);
  const values = snapshot.scope === scope ? snapshot.values : null;
  async function change(meal: JourneyPlannedMeal, state: PlanMealState) {
    const decision = values?.[meal.key];
    if (locked.current || !owns() || !meal.identity || !decision) return;
    locked.current = true;
    setBusy(true);
    request.current?.abort();
    generation.current++;
    const controller = new AbortController();
    request.current = controller;
    try {
      await mealCheckInsClient.change(meal.identity, decision.revision, state, controller.signal);
      if (owns()) await refresh(state === "PENDING" ? "Karar geri alındı; besin kayıtları korunuyor." : state === "SKIPPED" ? "Yemedim kaydedildi. Besin veya kalori eklenmedi." : "Yedim kaydedildi. Besin veya kalori eklenmedi.");
    } catch (error) {
      if (!owns() || controller.signal.aborted) return;
      // Re-read after an ambiguous write; never replay the old intent.
      await refresh(error instanceof ApiError && error.status === 409
        ? "Bu öğün başka bir cihazda değişti. Güncel durum okundu; eski karar tekrar uygulanmadı."
        : "İşlem doğrulanamadı. Güncel durumu kontrol et; otomatik tekrar yapılmadı.");
    } finally {
      if (owns()) { locked.current = false; setBusy(false); }
    }
  }
  return { values, busy, ready: Boolean(values), message: snapshot.scope === scope ? snapshot.message : "", refresh, change };
}
