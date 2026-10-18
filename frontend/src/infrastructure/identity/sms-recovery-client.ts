import { apiRequest } from "@/infrastructure/api/http-client";
export interface SmsRecoveryStatus {
  enabled: boolean;
  pending: boolean;
  verified: boolean;
  expiresAt?: string;
}
const request = <T>(action: string, body: object, signal?: AbortSignal) =>
  apiRequest<T>({
    path: `/identity/sms-recovery/${action}`,
    method: "POST",
    retryOnUnauthorized: false,
    headers: { "x-diewish-phone-setup": "1" },
    body: JSON.stringify(body),
    signal,
  });
export const smsRecoveryClient = {
  status: () =>
    apiRequest<SmsRecoveryStatus>({
      path: "/identity/sms-recovery/status",
      cache: "no-store",
      retryOnUnauthorized: false,
    }),
  begin: (phoneNumber: string, signal?: AbortSignal) =>
    request<{ expiresAt: string }>("begin", { phoneNumber }, signal),
  verify: (idToken: string, signal?: AbortSignal) =>
    request<{ verified: true }>("verify", { idToken }, signal),
  complete: (newPassword: string, passwordConfirmation: string) =>
    request<{ reset: true }>("complete", { newPassword, passwordConfirmation }),
  cancel: () => request<{ cancelled: true }>("cancel", {}),
};
