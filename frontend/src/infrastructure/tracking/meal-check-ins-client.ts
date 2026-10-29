import { apiRequest } from "@/infrastructure/api/http-client";
import { decisionDay, decisionMutation, type ExpectedPlanMeal, type PlanMealIdentity, type PlanMealState } from "@/application/health/plan-meal-decisions";

const endpoint = "/tracking/meal-check-ins";
export const mealCheckInsClient = {
  async read(meals: ExpectedPlanMeal[], signal: AbortSignal) {
    const identity = meals[0]?.identity;
    if (!identity || !Number.isInteger(identity.planVersion) || identity.planVersion < 1 || meals.some(m => !m.identity)) throw new Error("Plan identity unavailable");
    const groups = new Map<string, ExpectedPlanMeal[]>();
    for (const meal of meals) {
      const key = `${meal.identity!.planId}:${meal.identity!.dayNumber}:${meal.identity!.localDate}`;
      groups.set(key, [...(groups.get(key) ?? []), meal]);
    }
    const results = await Promise.all([...groups.values()].map(async group => {
      const id = group[0].identity!;
      const query = new URLSearchParams({ planId: id.planId, dayNumber: String(id.dayNumber), localDate: id.localDate });
      const result = await apiRequest<{ day: unknown }>({ path: `${endpoint}?${query}`, method: "GET", auth: true, retryOnUnauthorized: false, cache: "no-store", signal });
      return decisionDay(result.day, group);
    }));
    return Object.assign({}, ...results);
  },
  async change(identity: PlanMealIdentity, revision: number, state: PlanMealState, signal: AbortSignal) {
    const suffix = state === "SKIPPED" ? "/skip" : "";
    const result = await apiRequest<{ checkIn: unknown }>({
      path: `${endpoint}/${encodeURIComponent(identity.planId)}/${identity.dayNumber}/${identity.mealIndex}${suffix}?localDate=${identity.localDate}`,
      method: state === "PENDING" ? "DELETE" : "PUT", auth: true, retryOnUnauthorized: false,
      headers: { "If-Match": `"${revision}"` }, cache: "no-store", signal,
    });
    return decisionMutation(result.checkIn, identity, revision, state);
  },
};
