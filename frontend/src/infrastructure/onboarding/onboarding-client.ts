import { apiRequest } from "@/infrastructure/api/http-client";
import { ONBOARDING_ENDPOINTS } from "@/infrastructure/auth/endpoints";
import type { OnboardingProfile } from "@/domain/onboarding/types";
import type { OnboardingPayload, OnboardingResult } from "@/domain/onboarding/validation";

/**
 * Infrastructure-level onboarding client. All calls are authenticated (the HTTP
 * client attaches the access token). No UI or validation logic here.
 */
export const onboardingClient = {
  /** Fetches the current profile (`profile` is null until onboarding is done). */
  getProfile() {
    return apiRequest<{ profile: OnboardingProfile | null }>({
      path: ONBOARDING_ENDPOINTS.base,
      method: "GET",
      auth: true,
    });
  },

  /** Submits the mandatory onboarding profile and unlocks the app. */
  complete(payload: OnboardingPayload) {
    return apiRequest<OnboardingResult>({
      path: ONBOARDING_ENDPOINTS.base,
      method: "POST",
      auth: true,
      body: JSON.stringify(payload),
    });
  },
} as const;
