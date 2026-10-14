/** Aggregate timings only. No user or health data is included in metrics. */
export interface NutritionGenerationTimings {
  entitlementMs: number;
  goalPreparationMs: number;
  nutritionDataMs: number;
  quotaMs: number;
  aiWallMs: number;
  aiProviderMs: number;
  nutritionValidationMs: number;
  healthValidationMs: number;
  persistenceMs: number;
}

export type NutritionTimingPhase = keyof NutritionGenerationTimings;

export function createNutritionTimings(): NutritionGenerationTimings {
  return {
    entitlementMs: 0,
    goalPreparationMs: 0,
    nutritionDataMs: 0,
    quotaMs: 0,
    aiWallMs: 0,
    aiProviderMs: 0,
    nutritionValidationMs: 0,
    healthValidationMs: 0,
    persistenceMs: 0,
  };
}

export async function timeNutritionPhase<T>(
  metrics: NutritionGenerationTimings,
  phase: NutritionTimingPhase,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    metrics[phase] += performance.now() - started;
  }
}

export function timeNutritionCheck<T>(
  metrics: NutritionGenerationTimings | undefined,
  phase: NutritionTimingPhase,
  operation: () => T,
): T {
  if (!metrics) return operation();
  const started = performance.now();
  try {
    return operation();
  } finally {
    metrics[phase] += performance.now() - started;
  }
}

/** Rounded values for non-PII logs; cumulative provider time is not wall time when concurrent. */
export function roundNutritionTimings(metrics: NutritionGenerationTimings): Record<NutritionTimingPhase, number> {
  return Object.fromEntries(
    Object.entries(metrics).map(([phase, duration]) => [phase, Math.round(duration)]),
  ) as Record<NutritionTimingPhase, number>;
}
