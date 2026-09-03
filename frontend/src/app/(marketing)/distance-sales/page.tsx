import type { Metadata } from "next";

import { DISTANCE_SALES_AGREEMENT } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi",
  description: "Diewish ücretli dijital erişim paketleri için mesafeli satış sözleşmesi.",
  alternates: { canonical: "/distance-sales" },
};

export default function DistanceSalesPage() {
  return <LegalPage doc={DISTANCE_SALES_AGREEMENT} />;
}
