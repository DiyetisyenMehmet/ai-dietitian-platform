import { AsyncLocalStorage } from "node:async_hooks";
import { ApiError } from "../../utils/api-error";

// The measured live 7-day run took 142s after a transient provider retry.
// Leave persistence and HTTP response headroom outside the provider deadline:
// provider 155s < transaction 165s < backend 170s < web proxy 175s < client 180s.
export const NUTRITION_GENERATION_TRANSACTION_TIMEOUT_MS = 165_000;
const budget = new AsyncLocalStorage<AbortSignal>();

export function checkNutritionProviderBudget(): void {
  if (budget.getStore()?.aborted) {
    throw new ApiError(504, "Nutrition-plan generation exceeded its request window.", {
      code: "NUTRITION_PLAN_GENERATION_TIMEOUT",
    });
  }
}

export function nutritionProviderSignal(requestTimeoutMs: number): AbortSignal {
  checkNutritionProviderBudget();
  const deadline = budget.getStore();
  const request = AbortSignal.timeout(requestTimeoutMs);
  return deadline ? AbortSignal.any([deadline, request]) : request;
}

export async function withNutritionProviderBudget<T>(
  timeoutMs: number,
  run: () => Promise<T>,
): Promise<T> {
  return budget.run(AbortSignal.timeout(Math.max(1, timeoutMs)), async () => {
    const result = await run();
    checkNutritionProviderBudget();
    return result;
  });
}
