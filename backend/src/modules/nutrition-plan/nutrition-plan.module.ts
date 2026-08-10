import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { nutritionPlanRouter } from "./nutrition-plan.routes";

/**
 * Module manifest for Diewish's Personalized Nutrition Plan Engine (Sprint 13).
 *
 * Mirroring the Sprint 12 pattern, a "module" is a manifest of the routers it
 * contributes plus their mount paths. The root router (`src/routes/index.ts`)
 * consumes this so registration lives in one place and the module can be
 * wired/removed atomically. The `/nutrition-plans` base path does not collide
 * with any existing module.
 */
export const nutritionPlanModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/nutrition-plans", router: nutritionPlanRouter }],
};
