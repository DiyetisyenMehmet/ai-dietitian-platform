import { AsyncLocalStorage } from "node:async_hooks";

interface NutritionCallObserver {
  check: () => Promise<void>;
  reserve: () => Promise<void>;
  usage: (usage: { prompt?: number; output?: number; thinking?: number }) => Promise<void>;
}
const observers = new AsyncLocalStorage<NutritionCallObserver>();
export function withNutritionCallObserver<T>(
  observer: NutritionCallObserver,
  run: () => Promise<T>,
) {
  return observers.run(observer, run);
}
export async function checkNutritionCallAdmission() {
  await observers.getStore()?.check();
}
export async function reserveNutritionProviderCall() {
  await observers.getStore()?.check();
  await observers.getStore()?.reserve();
}
export async function recordNutritionProviderUsage(usage: {
  prompt?: number;
  output?: number;
  thinking?: number;
}) {
  await observers.getStore()?.usage(usage);
}
