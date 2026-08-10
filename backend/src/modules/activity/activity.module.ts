import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { activityRouter } from "./activity.routes";

/**
 * Module manifest for the Sprint 22 Activity domain. Provides the physical-
 * activity time-series the AI Health Coach reasons over. The `/activity` base
 * path does not collide with any existing module.
 */
export const activityModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/activity", router: activityRouter }],
};
