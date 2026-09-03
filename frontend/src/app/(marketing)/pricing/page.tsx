import type { Metadata } from "next";

import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { PricingCards } from "@/presentation/components/marketing/pricing-cards";
import { FaqAccordion } from "@/presentation/components/marketing/faq-accordion";
import { CtaSection } from "@/presentation/components/marketing/cta-section";

export const metadata: Metadata = {
  title: "Fiyatlandırma",
  description:
    "Diewish Free, Premium ve Premium Plus planları. İlk sürümde ücretli erişim Android uygulamasında Google Play üzerinden sunulacaktır.",
  alternates: { canonical: "/pricing" },
};

const PRICING_FAQ = [
  {
    question: "Ücretsiz plan neler içeriyor?",
    answer:
      "Ücretsiz hesap temel takip özelliklerini ve sınırlı yapay zekâ deneme haklarını içerir. Kullanım sınırları uygulama içinde plan durumunda gösterilir.",
  },
  {
    question: "Premium nasıl satın alınacak?",
    answer:
      "İlk sürümde Premium ve Premium Plus satın alımları Android uygulamasında Google Play üzerinden yapılacaktır. Web üzerinden doğrudan ödeme alınmayacaktır.",
  },
  {
    question: "Android'de aldığım Premium webde geçerli olacak mı?",
    answer:
      "Evet. Google Play satın alımı Diewish sunucusunda doğrulandıktan sonra erişim Diewish hesabına tanımlanır ve aynı hesapla giriş yaptığın desteklenen platformlarda geçerli olur.",
  },
  {
    question: "Aboneliğimi nereden yönetebilirim?",
    answer:
      "Google Play üzerinden başlatılan aboneliklerin ödeme ve abonelik yönetimi Google Play hesabı üzerinden yapılır. Diewish, Google Play kart bilgilerini kendi sunucularında saklamaz.",
  },
] as const;

/** Public pricing page served at `/pricing`. */
export default function PricingPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Fiyatlandırma"
          title="Sana uygun planı seç"
          description="Ücretsiz kullanmaya başlayabilirsin. Premium satın alma ilk sürümde Android uygulamasında Google Play üzerinden sunulacak."
        />
        <div className="mt-12">
          <PricingCards />
        </div>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="Sorular" title="Fiyatlandırma hakkında sık sorulanlar" />
        <div className="mt-12">
          <FaqAccordion items={PRICING_FAQ} />
        </div>
      </Section>

      <CtaSection
        title="Diewish'i ücretsiz kullanmaya başla"
        description="Hesabını oluştur, temel takip özelliklerini kullan ve desteklenen yapay zekâ özelliklerini dene."
      />
    </>
  );
}
