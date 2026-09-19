import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { historyRouter } from "./history.routes";

export const historyModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/history", router: historyRouter }],
};
