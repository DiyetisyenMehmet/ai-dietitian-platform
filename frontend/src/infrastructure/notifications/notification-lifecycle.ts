const SAFE_NOTIFICATION_TARGETS = new Set([
  "/dashboard",
  "/ai",
  "/insights",
  "/goals",
  "/meals",
  "/activity",
  "/sleep",
  "/progress",
  "/profile/blood-tests",
  "/profile/notifications",
]);

/** Stable idempotency key: any token rotation or account switch changes it. */
export function notificationRegistrationKey(userId: string, token: string): string {
  const cleanUserId = userId.trim();
  const cleanToken = token.trim();
  return cleanUserId && cleanToken ? `${cleanUserId}:${cleanToken}` : "";
}

/**
 * Returns null while auth/onboarding is not ready, deliberately preserving the
 * native pending target for a later authenticated pass. Unknown targets fail
 * closed to dashboard rather than allowing arbitrary URLs or paths.
 */
export function resolvePendingNotificationTarget(
  raw: string | null | undefined,
  canNavigate: boolean,
): string | null {
  if (!canNavigate) return null;
  const target = raw?.trim() ?? "";
  if (!target) return null;
  return SAFE_NOTIFICATION_TARGETS.has(target) ? target : "/dashboard";
}

/**
 * Releases server ownership before native cleanup. Cleanup still runs when the
 * network/API unregister fails so an old account cannot keep a usable token on
 * the device indefinitely.
 */
export async function releaseNotificationDevice(
  token: string,
  unregister: (token: string) => Promise<unknown>,
  cleanup: () => void,
): Promise<void> {
  const cleanToken = token.trim();
  if (cleanToken) {
    try {
      await unregister(cleanToken);
    } catch {
      // Native invalidation below remains mandatory even if the API is offline.
    }
  }
  try {
    cleanup();
  } catch {
    // Optional native cleanup must never block account logout.
  }
}
