import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { trackingRouter } from "./tracking.routes";

/**
 * Module manifest for the Sprint 19 tracking domain. Provides the time-series
 * data sources (weight / meals / water) the AI Health Coach reasons over. The
 * `/tracking` base path does not collide with any existing module.
 */
export const trackingModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/tracking", router: trackingRouter }],
};
