import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { goalsRouter } from "./goals.routes";

export const goalsModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/goals", router: goalsRouter }],
};
