import type { Metadata } from "next";
import Link from "next/link";

import { FAQ_ITEMS } from "@/shared/constants/site";
import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { PricingCards } from "@/presentation/components/marketing/pricing-cards";
import { FaqAccordion } from "@/presentation/components/marketing/faq-accordion";
import { CtaSection } from "@/presentation/components/marketing/cta-section";

export const metadata: Metadata = {
  title: "Fiyatlandırma",
  description:
    "Diewish Free, Premium ve Premium Plus planları. Ücretli V1 paketleri tek seferlik 30 günlük dijital erişim sağlar; otomatik yenileme yoktur.",
  alternates: { canonical: "/pricing" },
};

const PRICING_FAQ = FAQ_ITEMS.filter((item) =>
  [
    "Ücretsiz plan neler içeriyor?",
    "Ücretli erişim nasıl çalışır?",
    "Ücretli erişimi iptal edebilir miyim?",
    "Kart bilgilerim Diewish'te saklanıyor mu?",
  ].includes(item.question),
);

/** Public pricing page served at `/pricing`. */
export default function PricingPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Fiyatlandırma"
          title="Sana uygun planı seç"
          description="Ücretsiz başla. Ücretli V1 paketleri tek seferlik 30 günlük dijital erişimdir; otomatik yenileme ve yıllık tahsilat yoktur."
        />
        <div className="mt-12">
          <PricingCards />
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
          Satın alma öncesinde güncel toplam bedel ve erişim süresi gösterilir. Dijital hizmet koşulları için{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/distance-sales">Mesafeli Satış Sözleşmesi</Link>
          {" "}ve{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/delivery-refund">Teslimat, İptal ve İade Koşulları</Link>
          {" "}incelenebilir.
        </p>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="Sorular" title="Fiyatlandırma hakkında sık sorulanlar" />
        <div className="mt-12">
          <FaqAccordion items={PRICING_FAQ} />
        </div>
      </Section>

      <CtaSection
        title="Diewish'i ücretsiz kullanmaya başla"
        description="İhtiyacın olduğunda ücretli 30 günlük erişim paketlerini güncel fiyatlarıyla değerlendirebilirsin."
      />
    </>
  );
}
