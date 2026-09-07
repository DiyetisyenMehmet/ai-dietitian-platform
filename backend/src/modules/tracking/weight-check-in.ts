export const WEIGHT_CHECK_IN_INTERVAL_DAYS = 7;
const DAY_MS = 86_400_000;

export interface WeightCheckInStatus {
  active: boolean;
  intervalDays: number;
  required: boolean;
  lastLoggedAt: string | null;
  nextDueAt: string | null;
  overdueDays: number;
}

/**
 * Deterministic weekly weigh-in schedule. The schedule only starts after
 * onboarding; completed legacy profiles without a weight row are immediately
 * due so plan recalculation never silently relies on stale/unknown weight.
 */
export function buildWeightCheckInStatus(
  onboardingCompleted: boolean,
  lastLoggedAt: Date | null,
  now = new Date(),
): WeightCheckInStatus {
  if (!onboardingCompleted) {
    return {
      active: false,
      intervalDays: WEIGHT_CHECK_IN_INTERVAL_DAYS,
      required: false,
      lastLoggedAt: lastLoggedAt?.toISOString() ?? null,
      nextDueAt: null,
      overdueDays: 0,
    };
  }

  if (!lastLoggedAt) {
    return {
      active: true,
      intervalDays: WEIGHT_CHECK_IN_INTERVAL_DAYS,
      required: true,
      lastLoggedAt: null,
      nextDueAt: null,
      overdueDays: 0,
    };
  }

  const nextDueMs = lastLoggedAt.getTime() + WEIGHT_CHECK_IN_INTERVAL_DAYS * DAY_MS;
  const nowMs = now.getTime();
  const required = nowMs >= nextDueMs;

  return {
    active: true,
    intervalDays: WEIGHT_CHECK_IN_INTERVAL_DAYS,
    required,
    lastLoggedAt: lastLoggedAt.toISOString(),
    nextDueAt: new Date(nextDueMs).toISOString(),
    overdueDays: required ? Math.max(0, Math.floor((nowMs - nextDueMs) / DAY_MS)) : 0,
  };
}
