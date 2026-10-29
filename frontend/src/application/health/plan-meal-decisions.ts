/** The v2 contract of backend PR #128. No legacy slot/food evidence is accepted. */
export type PlanMealState = "PENDING" | "EATEN" | "SKIPPED";
export interface PlanMealIdentity {
  planId: string;
  planVersion: number;
  dayNumber: number;
  mealIndex: number;
  localDate: string;
}
export interface PlanMealDecision {
  id: string | null;
  state: PlanMealState;
  revision: number;
}
export type PlanMealDecisions = Record<string, PlanMealDecision>;
export interface ExpectedPlanMeal {
  key: string;
  identity?: PlanMealIdentity;
  meal: { time: string };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid decision response");
  return value as Record<string, unknown>;
}
export function decisionValue(value: unknown): PlanMealDecision {
  const row = record(value);
  if (!(["PENDING", "EATEN", "SKIPPED"] as unknown[]).includes(row.state) ||
      !Number.isInteger(row.revision) || (row.revision as number) < 0 ||
      (row.revision as number) > 2_147_483_646 || row.active !== (row.state === "EATEN") ||
      (row.revision === 0 ? row.id !== null || row.state !== "PENDING" : typeof row.id !== "string" || !row.id)) {
    throw new Error("Invalid decision state");
  }
  return { id: row.id as string | null, state: row.state as PlanMealState, revision: row.revision as number };
}
export function decisionDay(value: unknown, expected: ExpectedPlanMeal[]): PlanMealDecisions {
  const day = record(value), identity = expected[0]?.identity;
  if (!identity || day.contractVersion !== 2 || day.source !== "PLAN_CHECK_INS_ONLY" ||
      day.legacyMealLogsExcluded !== true || day.planId !== identity.planId ||
      day.planVersion !== identity.planVersion || day.dayNumber !== identity.dayNumber ||
      day.localDate !== identity.localDate || !Array.isArray(day.checkIns) ||
      day.checkIns.length !== expected.length) throw new Error("Plan decision scope changed");
  const result: PlanMealDecisions = {};
  const seen = new Set<number>();
  const ids = new Set<string>();
  if (expected.some(m => !m.identity || m.identity.planId !== identity.planId || m.identity.planVersion !== identity.planVersion || m.identity.dayNumber !== identity.dayNumber || m.identity.localDate !== identity.localDate)) throw new Error("Mixed decision scope");
  for (const value of day.checkIns) {
    const row = record(value);
    const meal = expected.find((item) => item.identity?.mealIndex === row.mealIndex);
    if (!meal || seen.has(row.mealIndex as number) || row.localDate !== identity.localDate ||
        row.scheduledTime !== meal.meal.time) throw new Error("Plan meal identity mismatch");
    seen.add(row.mealIndex as number);
    const decision = decisionValue(row);
    if (decision.id && ids.has(decision.id)) throw new Error("Repeated check-in identity");
    if (decision.id) ids.add(decision.id);
    result[meal.key] = decision;
  }
  const values = Object.values(result), eaten = values.filter(v => v.state === "EATEN").length;
  const skipped = values.filter(v => v.state === "SKIPPED").length, total = values.length;
  if (day.total !== total || day.completed !== eaten || day.eaten !== eaten ||
      day.skipped !== skipped || day.decided !== eaten + skipped || day.pending !== total - eaten - skipped ||
      day.allDone !== (total > 0 && eaten === total) ||
      day.allDecided !== (total > 0 && eaten + skipped === total)) throw new Error("Invalid decision totals");
  return result;
}
export function decisionMutation(value: unknown, identity: PlanMealIdentity, revision: number, state: PlanMealState) {
  const row = record(value), result = decisionValue(row);
  if (row.contractVersion !== 2 || row.planId !== identity.planId || row.planVersion !== identity.planVersion ||
      row.dayNumber !== identity.dayNumber || row.mealIndex !== identity.mealIndex || row.localDate !== identity.localDate ||
      result.state !== state || result.revision !== revision + 1) throw new Error("Invalid decision acknowledgement");
  return result;
}
