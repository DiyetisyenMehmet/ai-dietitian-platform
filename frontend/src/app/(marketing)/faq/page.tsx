import type { Metadata } from "next";
import Link from "next/link";

import { FAQ_ITEMS } from "@/shared/constants/site";
import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { FaqAccordion } from "@/presentation/components/marketing/faq-accordion";
import { Button } from "@/presentation/components/ui/button";

export const metadata: Metadata = {
  title: "Sıkça Sorulan Sorular",
  description:
    "Diewish hakkında sıkça sorulan sorular: platform, tıbbi tavsiye, ücretsiz plan, abonelik iptali, ödeme güvenliği ve veri gizliliği.",
  alternates: { canonical: "/faq" },
};

/** Public FAQ page served at `/faq`. */
export default function FaqPage() {
  return (
    <Section>
      <SectionHeading
        eyebrow="S.S.S."
        title="Sıkça sorulan sorular"
        description="Merak ettiklerinin yanıtı burada. Bulamadıysan bize ulaş."
      />
      <div className="mt-12">
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
      <div className="mt-10 text-center">
        <p className="text-sm text-muted-foreground">Sorunun yanıtını bulamadın mı?</p>
        <Button asChild className="mt-4">
          <Link href="/contact">Bizimle İletişime Geç</Link>
        </Button>
      </div>
    </Section>
  );
}
