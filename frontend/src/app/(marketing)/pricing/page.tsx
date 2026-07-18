import type { Metadata } from "next";

import { FAQ_ITEMS } from "@/shared/constants/site";
import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { PricingCards } from "@/presentation/components/marketing/pricing-cards";
import { FaqAccordion } from "@/presentation/components/marketing/faq-accordion";
import { CtaSection } from "@/presentation/components/marketing/cta-section";

export const metadata: Metadata = {
  title: "Fiyatlandırma",
  description:
    "Diewish planları: Free, Premium ve Premium Plus. Aylık veya yıllık faturalandırma seçenekleriyle sana en uygun planı seç. Ödemeler iyzico güvencesiyle.",
  alternates: { canonical: "/pricing" },
};

const PRICING_FAQ = FAQ_ITEMS.filter((item) =>
  ["Ücretsiz plan neler içeriyor?", "Aboneliğimi istediğim zaman iptal edebilir miyim?", "Ödemeler güvenli mi?"].includes(
    item.question,
  ),
);

/** Public pricing page served at `/pricing`. */
export default function PricingPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Fiyatlandırma"
          title="Sana uygun planı seç"
          description="Ücretsiz başla, hazır olduğunda yükselt. Tüm planlarda taahhüt yok — istediğin an iptal et."
        />
        <div className="mt-12">
          <PricingCards />
        </div>
      </Section>

      <Section muted>
        <SectionHeading
          eyebrow="Sorular"
          title="Fiyatlandırma hakkında sık sorulanlar"
        />
        <div className="mt-12">
          <FaqAccordion items={PRICING_FAQ} />
        </div>
      </Section>

      <CtaSection
        title="Diewish Premium ile tüm özelliklerin kilidini aç"
        description="Kişiselleştirilmiş planlar, kan tahlili analizi ve gelişmiş yapay zekâ asistanı seni bekliyor."
      />
    </>
  );
}
