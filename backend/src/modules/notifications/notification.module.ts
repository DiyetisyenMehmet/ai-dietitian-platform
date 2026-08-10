import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { notificationRouter } from "./notification.routes";

/**
 * Module manifest for the Sprint 19 notifications domain. The `/notifications`
 * base path does not collide with any existing module.
 */
export const notificationModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/notifications", router: notificationRouter }],
};
