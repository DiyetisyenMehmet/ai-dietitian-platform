import type { Metadata } from "next";

import { PRIVACY_POLICY } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description:
    "Diewish Gizlilik Politikası: KVKK kapsamında hangi verileri işlediğimizi, verilerin işlenme amaçlarını, aktarımını ve haklarınızı açıklar.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY_POLICY} />;
}
