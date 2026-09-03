import type { Metadata } from "next";

import { KVKK_POLICY } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  description:
    "Diewish KVKK Aydınlatma Metni: veri sorumlusu, işlenen veri kategorileri, amaçlar, hukuki sebepler, aktarım ve ilgili kişi hakları.",
  alternates: { canonical: "/kvkk" },
};

export default function KvkkPage() {
  return <LegalPage doc={KVKK_POLICY} />;
}
