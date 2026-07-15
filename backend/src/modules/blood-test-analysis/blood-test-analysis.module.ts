import type { Router } from "express";

import { bloodTestAnalysisRouter } from "./blood-test-analysis.routes";
import { referenceRangesRouter } from "./reference-ranges/reference-ranges.routes";

/**
 * Module manifest for Diewish's AI Blood Test Analysis Engine (Sprint 12).
 *
 * This codebase is an Express modular monolith rather than a DI framework, so a
 * "module" is expressed as a manifest of the routers it contributes plus the
 * base paths they mount at. The root router (`src/routes/index.ts`) consumes
 * this so registration lives in one place and the module can be wired/removed
 * atomically — mirroring the intent of a NestJS feature module.
 */
export interface RouteRegistration {
  /** Mount path relative to the API prefix. */
  path: string;
  /** The Express router to mount. */
  router: Router;
  /**
   * When true, this router must be mounted before any other router sharing the
   * same base path so its concrete routes win over parameterized ones.
   */
  mountFirst?: boolean;
}

/** Routers contributed by the blood-test analysis module. */
export const bloodTestAnalysisModule: { routes: RouteRegistration[] } = {
  routes: [
    // Must precede the Sprint 11 upload router so `/analyses` and
    // `/:id/analysis(e)` are not shadowed by its `/:id` routes.
    { path: "/blood-tests", router: bloodTestAnalysisRouter, mountFirst: true },
    { path: "/blood-test-reference-ranges", router: referenceRangesRouter },
  ],
};
