import type { NutritionPlan } from "@prisma/client";
/** Internal safety and lineage fingerprints stay server-side. */
export function publicNutritionPlan(plan: NutritionPlan) {
  const { nutritionContextHash: _context, originPlanId: _origin, ...publicPlan } = plan;
  return publicPlan;
}
