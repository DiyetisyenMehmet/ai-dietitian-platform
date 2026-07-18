import type { Metadata } from "next";

import { TERMS_OF_SERVICE } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Kullanım Koşulları",
  description:
    "Diewish Kullanım Koşulları: hizmetin kapsamı, kullanıcı yükümlülükleri, abonelik ve ödemeler ile sorumluluğun sınırlandırılması.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage doc={TERMS_OF_SERVICE} />;
}
