"use client";

import * as React from "react";
import { authStore, useAuth } from "@/application/auth/auth-store";
import { useNutritionPlan } from "@/application/health/nutrition-plan-store";
import { journeyPlanDay, type JourneyPlannedMeal } from "@/application/health/journey-plan";
import { localDayKey } from "@/application/health/daily-data-readiness";
import { mealCheckInsClient } from "@/infrastructure/tracking/meal-check-ins-client";
import type { PlanMealIdentity } from "@/application/health/plan-meal-decisions";

interface JourneyEntry {
  owner: string;
  day: string;
  identity: PlanMealIdentity;
  phase: "open" | "saving" | "saved" | "uncertain";
}
const prefix = "diewish:journey-entry:";
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readJourneyEntry(token: string | null | undefined): JourneyEntry | null {
  if (!token || !tokenPattern.test(token) || typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix + token) ?? "null") as JourneyEntry | null;
    if (!value || typeof value.owner !== "string" || typeof value.day !== "string" ||
      !value.identity || !["open", "saving", "saved", "uncertain"].includes(value.phase)) return null;
    return value;
  } catch { return null; }
}
function write(token: string, entry: JourneyEntry) {
  sessionStorage.setItem(prefix + token, JSON.stringify(entry));
}
export function startJourneyEntry(owner: string, day: string, meal: JourneyPlannedMeal) {
  if (!meal.identity || authStore.getSnapshot().user?.id !== owner || localDayKey() !== day) throw new Error("Öğün bağlamı değişti. Yolculuğundan tekrar aç.");
  const token = crypto.randomUUID();
  write(token, { owner, day, identity: meal.identity, phase: "open" });
  return `/meals/add?journey=${token}&slot=${meal.foodSlot ?? meal.slot ?? "snack"}&day=${day}&returnTo=/dashboard`;
}
export function samePlanMeal(left: PlanMealIdentity, right: PlanMealIdentity) {
  return left.planId === right.planId && left.planVersion === right.planVersion && left.dayNumber === right.dayNumber && left.mealIndex === right.mealIndex && left.localDate === right.localDate;
}
/** Only navigation metadata is stored, never scanned food, health data or tokens. */
export function useJourneyEntry(explicitToken?: string) {
  const { user } = useAuth();
  const plan = useNutritionPlan();
  const [locationToken, setToken] = React.useState<string | null>(null);
  const token = explicitToken ?? locationToken;
  const requested = explicitToken !== undefined || locationToken !== null;
  const [loaded, setLoaded] = React.useState(false);
  const [tick, update] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    setToken(explicitToken ?? new URLSearchParams(window.location.search).get("journey"));
    setLoaded(true);
    const resume = () => update();
    window.addEventListener("focus", resume);
    const timer = setInterval(resume, 30_000);
    return () => { window.removeEventListener("focus", resume); clearInterval(timer); };
  }, [explicitToken]);
  void tick;
  const entry = readJourneyEntry(token);
  const today = localDayKey();
  const meals = React.useMemo(() => journeyPlanDay(plan.activePlan, new Date(`${today}T12:00:00`)).meals, [plan.activePlan, today]);
  const meal = entry && meals.find(m => m.identity && samePlanMeal(m.identity, entry.identity));
  const valid = Boolean(loaded && entry && meal && user?.id === entry.owner &&
    plan.ownerUserId === entry.owner && plan.hydrated && !plan.readError && entry.day === localDayKey());
  const backHref = token && tokenPattern.test(token) ? `/dashboard?journey=${token}` : "/dashboard";
  function requireEntry() {
    // Read storage and wall clock at the action, not merely at render time.
    const currentToken = explicitToken ?? new URLSearchParams(window.location.search).get("journey");
    const current = readJourneyEntry(currentToken);
    if (!valid || !current || !currentToken || current.phase !== "open" || current.owner !== authStore.getSnapshot().user?.id ||
      current.day !== localDayKey() || !meal?.identity || !samePlanMeal(current.identity, meal.identity)) {
      throw new Error("Hesap, gün, plan veya kayıt durumu değişti. Yolculuğundan tekrar aç.");
    }
    return { token: currentToken, entry: current, meal };
  }
  async function prepare() {
    const current = requireEntry();
    await mealCheckInsClient.read(meals, new AbortController().signal);
    const checked = requireEntry();
    if (checked.token !== current.token) throw new Error("Öğün bağlamı değişti.");
    write(checked.token, { ...checked.entry, phase: "saving" });
    update();
    return checked;
  }
  function finish(phase: "saved" | "uncertain") {
    if (!token) return;
    const current = readJourneyEntry(token);
    if (current?.owner === authStore.getSnapshot().user?.id) write(token, { ...current, phase });
    update();
  }
  async function save(persist: (slot: JourneyPlannedMeal["slot"], loggedAt: string) => Promise<unknown>) {
    if ((explicitToken ?? new URLSearchParams(window.location.search).get("journey")) === null) return null;
    const checked = await prepare();
    try {
      const result = await persist(checked.meal.foodSlot ?? checked.meal.slot, new Date().toISOString());
      const acknowledgement = result as { log?: { id?: unknown } } | null;
      if (!acknowledgement?.log || typeof acknowledgement.log.id !== "string" || !acknowledgement.log.id) throw new Error("Besin kaydı doğrulanamadı. Beslenme kayıtlarını kontrol et.");
      if (authStore.getSnapshot().user?.id !== checked.entry.owner || localDayKey() !== checked.entry.day) throw new Error("Hesap veya gün değişti. Beslenme kayıtlarını kontrol et.");
      finish("saved");
      return `/dashboard?journey=${checked.token}`;
    } catch (error) { finish("uncertain"); throw error; }
  }
  return { token, requested, loaded, valid, entry, meal, backHref, prepare, finish, save,
    scanHref: (mode: "photo" | "barcode") => `/meals/scan?mode=${mode}&journey=${token ?? ""}` };
}
