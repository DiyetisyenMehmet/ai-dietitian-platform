import type { Metadata } from "next";

import { DELIVERY_REFUND_POLICY } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Dijital Teslimat, İptal ve İade Koşulları",
  description:
    "Diewish ücretli dijital erişim paketlerinin teslimat, iptal, cayma ve iade koşulları.",
  alternates: { canonical: "/delivery-refund" },
};

export default function DeliveryRefundPage() {
  return <LegalPage doc={DELIVERY_REFUND_POLICY} />;
}
