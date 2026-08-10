import type { Metadata } from "next";

import { COOKIE_POLICY } from "@/shared/constants/legal";
import { LegalPage } from "@/presentation/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Çerez Politikası",
  description:
    "Diewish Çerez Politikası: web sitesinde ve uygulamada kullanılan çerez türleri, kullanım amaçları ve çerezleri nasıl yönetebileceğiniz.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return <LegalPage doc={COOKIE_POLICY} />;
}
