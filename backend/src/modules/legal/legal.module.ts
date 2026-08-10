import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";

import { legalRouter } from "./legal.routes";

/**
 * Module manifest for Diewish's Legal & Consent engine (Sprint 15).
 *
 * Contributes a single router at `/legal` covering the privacy policy, terms of
 * service, medical disclaimer and KVKK explicit-consent documents plus the
 * per-user consent grant/withdraw/status endpoints. No base-path sharing, so no
 * mount ordering is required.
 */
export const legalModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/legal", router: legalRouter }],
};
