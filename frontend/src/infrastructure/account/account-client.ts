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
