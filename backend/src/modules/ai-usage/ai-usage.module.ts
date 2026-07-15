import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { aiUsageRouter } from "./ai-usage.routes";

/**
 * Module manifest for Diewish's AI Usage Quota capability (Sprint 14, C5).
 *
 * Following the established Express-monolith pattern, a module is a manifest of
 * the routers it contributes. The quota enforcement itself is consumed as a
 * service (`aiUsageService`) by AI features; this router only exposes read-only
 * usage visibility at `/ai-usage`.
 */
export const aiUsageModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/ai-usage", router: aiUsageRouter }],
};
