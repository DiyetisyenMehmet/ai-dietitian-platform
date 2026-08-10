import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";

import { paymentsRouter, subscriptionRouter } from "./payments.routes";

/**
 * Module manifest for Diewish's Payments & Subscriptions engine (Sprint 15).
 *
 * Mirrors the manifest pattern used by the other feature modules: the module
 * contributes routers plus the base paths they mount at, and the root router
 * (`src/routes/index.ts`) consumes this so wiring lives in one place.
 *
 * Two routers are contributed:
 *  - `subscriptionRouter` at `/subscription` — plan catalog + subscription
 *    status/lifecycle (cancel).
 *  - `paymentsRouter` at `/payments` — checkout initiation, payment
 *    verification, payment history, and the iyzico webhook receiver.
 *
 * Neither shares a base path with another module, so no mount ordering is
 * required.
 */
export const paymentsModule: { routes: RouteRegistration[] } = {
  routes: [
    { path: "/subscription", router: subscriptionRouter },
    { path: "/payments", router: paymentsRouter },
  ],
};
