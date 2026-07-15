import type { Metadata } from "next";

import { OnboardingWizard } from "@/presentation/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Profilinizi Oluşturun",
};

/**
 * Mandatory onboarding route. Access control (must be authenticated, must not
 * have completed onboarding) is enforced by the global route guard; this page
 * simply renders the multi-step wizard.
 */
export default function OnboardingPage() {
  return <OnboardingWizard />;
}
