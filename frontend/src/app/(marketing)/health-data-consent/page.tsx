import type { Metadata } from "next";

import { HEALTH_DATA_CONSENT } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Sağlık Verisi Açık Rıza Metni",
  description:
    "Diewish özel nitelikli sağlık verilerinin işlenmesine ilişkin ayrı açık rıza metni.",
  alternates: { canonical: "/health-data-consent" },
};

export default function HealthDataConsentPage() {
  return <LegalPage doc={HEALTH_DATA_CONSENT} />;
}
