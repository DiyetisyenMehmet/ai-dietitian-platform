import type { RouteRegistration } from "../blood-test-analysis/blood-test-analysis.module";
import { expertProductRouter } from "./expert-product.routes";

/**
 * Stable seam for future expert-reviewed teas, functional foods, vitamins or
 * supplement products. Current production policy remains FOOD_ONLY; mounting
 * this module only exposes curated catalog metadata and does not grant AI
 * recommendation authority.
 */
export const expertProductModule: { routes: RouteRegistration[] } = {
  routes: [{ path: "/expert-products", router: expertProductRouter }],
};
