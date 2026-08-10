import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { aiCoachRouter } from "./ai-coach.routes";

/**
 * Module manifest for the Sprint 19 AI Health Coach domain. The `/ai-coach`
 * base path does not collide with the existing `/ai-chat` or `/ai-usage`
 * modules.
 */
export const aiCoachModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/ai-coach", router: aiCoachRouter }],
};
