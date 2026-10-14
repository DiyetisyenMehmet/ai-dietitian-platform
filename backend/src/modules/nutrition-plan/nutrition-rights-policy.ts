import type { SubscriptionTier } from "@prisma/client";

/** Calendar arithmetic always derives from the original anchor, never drifts at month end. */
export function addCalendarMonths(anchor: Date, months: number): Date {
  const next = new Date(anchor);
  next.setUTCDate(1);
  next.setUTCMonth(anchor.getUTCMonth() + months);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(anchor.getUTCDate(), last));
  return next;
}

export function subscriptionMonth(anchor: Date, now: Date): { start: Date; end: Date } {
  if (anchor > now) throw new Error("Subscription period anchor is in the future");
  let offset =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  if (addCalendarMonths(anchor, offset) > now) offset--;
  return { start: addCalendarMonths(anchor, offset), end: addCalendarMonths(anchor, offset + 1) };
}

export function turkeyDay(now: Date): { start: Date; end: Date } {
  const local = new Date(now.getTime() + 3 * 3_600_000);
  const start = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3_600_000,
  );
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function nutritionLimits(tier: SubscriptionTier, grandfathered = false) {
  if (tier === "FREE") return { day: null, month: null };
  if (grandfathered) return tier === "PREMIUM" ? { day: 15, month: 100 } : { day: 60, month: 600 };
  return tier === "PREMIUM" ? { day: 2, month: 5 } : { day: 3, month: 10 };
}

export function freeAvailableAt(lastSuccessfulDelivery: Date | null): Date | null {
  return lastSuccessfulDelivery ? addCalendarMonths(lastSuccessfulDelivery, 5) : null;
}
