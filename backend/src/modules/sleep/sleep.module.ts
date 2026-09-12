import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { sleepRouter } from "./sleep.routes";

/** FR-012 sleep tracking module. */
export const sleepModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/sleep", router: sleepRouter }],
};
