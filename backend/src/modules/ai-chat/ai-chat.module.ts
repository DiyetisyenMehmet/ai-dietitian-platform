import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { aiChatRouter } from "./ai-chat.routes";

/**
 * Module manifest for Diewish's AI Dietitian Chat (Sprint 14, C2).
 *
 * Following the established Express-monolith pattern, a module is a manifest of
 * the routers it contributes plus their mount paths. The `/ai-chat` base path
 * does not collide with any existing module.
 */
export const aiChatModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/ai-chat", router: aiChatRouter }],
};
