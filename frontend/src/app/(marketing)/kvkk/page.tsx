import type { Metadata } from "next";

import { KVKK_POLICY } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "KVKK / GDPR",
  description:
    "Diewish KVKK / GDPR Aydınlatma ve Açık Rıza metni: veri sorumlusu, işlenen sağlık verileri, açık rıza ve veri sahibi haklarınız.",
  alternates: { canonical: "/kvkk" },
};

export default function KvkkPage() {
  return <LegalPage doc={KVKK_POLICY} />;
}
