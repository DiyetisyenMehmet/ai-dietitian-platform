import type { Metadata } from "next";

import { EXTENDED_FEATURES, HOW_IT_WORKS } from "@/shared/constants/site";
import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { CtaSection } from "@/presentation/components/marketing/cta-section";

export const metadata: Metadata = {
  title: "Özellikler",
  description:
    "Diewish'in tüm özellikleri: yapay zekâ destekli beslenme, kişiselleştirilmiş planlar, kan tahlili analizi, diyetisyen asistanı, öğün ve hedef takibi, KVKK uyumlu gizlilik.",
  alternates: { canonical: "/features" },
};

/** Public features page served at `/features`. */
export default function FeaturesPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Özellikler"
          title="Sağlıklı yaşam için ihtiyacın olan her şey"
          description="Diewish, yapay zekânın gücünü kişisel beslenme yolculuğunla birleştiren kapsamlı bir platformdur."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {EXTENDED_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <feature.icon className="size-6 text-primary" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="Nasıl çalışır" title="Başlamak çok kolay" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.step} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {step.step}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaSection />
    </>
  );
}
