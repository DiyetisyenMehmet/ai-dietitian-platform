import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { adminRouter } from "./admin.routes";

export const adminModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/admin", router: adminRouter }],
};
