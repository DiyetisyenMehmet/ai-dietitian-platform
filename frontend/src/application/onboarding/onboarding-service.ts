import { ApiError } from "@/infrastructure/api/http-client";
import { onboardingClient } from "@/infrastructure/onboarding/onboarding-client";
import type { OnboardingResult, OnboardingPayload } from "@/domain/onboarding/validation";

/** Discriminated result so the UI never has to catch raw exceptions. */
export type OnboardingActionResult =
  | { ok: true; data: OnboardingResult }
  | { ok: false; error: string };

function toFriendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 401) return "Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.";
    if (error.status === 422) return "Girilen bilgiler geçersiz. Lütfen kontrol edin.";
    if (error.status >= 500) return "Sunucu hatası. Lütfen daha sonra tekrar deneyin.";
    return error.message;
  }
  return "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";
}

/**
 * Application service for the onboarding use case. Owns error normalization for
 * presentation; delegates transport to the infrastructure client.
 */
export const onboardingService = {
  async complete(payload: OnboardingPayload): Promise<OnboardingActionResult> {
    try {
      const data = await onboardingClient.complete(payload);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toFriendlyError(error) };
    }
  },
} as const;
