import type { RawDashboardCardPreferences } from "@/domain/account/dashboard-card-preferences";
import { apiRequest } from "@/infrastructure/api/http-client";

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Changes the authenticated user's password on the backend.
 *
 * A wrong current password is also returned as HTTP 401 by this endpoint, so
 * automatic access-token refresh is deliberately disabled for this request.
 * Otherwise a credential-validation failure would rotate the refresh token
 * unnecessarily before returning the same password error.
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiRequest<void>({
    path: "/account/password/change",
    method: "POST",
    auth: true,
    retryOnUnauthorized: false,
    body: JSON.stringify(input),
  });
}


export async function getDashboardCardPreferences(): Promise<RawDashboardCardPreferences> {
  const result = await apiRequest<{ preferences: RawDashboardCardPreferences }>({
    path: "/account/dashboard-cards",
    method: "GET",
    auth: true,
  });
  return result.preferences;
}

export async function updateDashboardCardPreferences(
  preferences: RawDashboardCardPreferences,
): Promise<RawDashboardCardPreferences> {
  const result = await apiRequest<{ preferences: RawDashboardCardPreferences }>({
    path: "/account/dashboard-cards",
    method: "PUT",
    auth: true,
    body: JSON.stringify({
      order: preferences.order ?? [],
      hidden: preferences.hidden ?? [],
    }),
  });
  return result.preferences;
}
