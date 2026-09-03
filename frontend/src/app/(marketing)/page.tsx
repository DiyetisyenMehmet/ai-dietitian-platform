import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ClipboardList,
  MessageSquareHeart,
  Sparkles,
  TestTube2,
} from "lucide-react";

import { APP_CONFIG } from "@/shared/constants/app";
import {
  CORE_FEATURES,
  FAQ_ITEMS,
  HOW_IT_WORKS,
  KEY_BENEFITS,
} from "@/shared/constants/site";
import { Button } from "@/presentation/components/ui/button";
import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { CtaSection } from "@/presentation/components/marketing/cta-section";
import { FaqAccordion } from "@/presentation/components/marketing/faq-accordion";

export const metadata: Metadata = {
  title: "Yapay Zekâ Destekli Kişisel Beslenme Platformu",
  description:
    "Diewish; kişiselleştirilmiş beslenme planları, kan tahlili özeti, öğün ve ilerleme takibi ile yapay zekâ beslenme asistanını tek platformda buluşturur.",
  alternates: { canonical: "/" },
};

/** Public landing page served at `/`. */
export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background"
          aria-hidden="true"
        />
        <div className="container flex flex-col items-center py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            Yapay zekâ destekli beslenme asistanı
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Sağlıklı yaşam için{" "}
            <span className="text-primary">sana özel</span> beslenme rehberin
          </h1>
          <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {APP_CONFIG.name}; profil ve hedeflerine göre beslenme planları oluşturur, desteklenen
            kan tahlili dosyalarından bilgilendirme amaçlı özetler üretir ve yapay zekâ beslenme
            asistanıyla kayıtlarını tek yerde kullanmana yardımcı olur.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Ücretsiz Başla
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">Planları İncele</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Ücretsiz hesap oluşturmak için kredi kartı gerekmez
          </p>
        </div>
      </section>

      <Section muted>
        <SectionHeading
          eyebrow="Neler sunuyoruz"
          title="Beslenme takibini tek yerde birleştiren dört özellik"
          description="Diewish, kayıtlarını ve yapay zekâ destekli özellikleri aynı deneyimde buluşturur."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_FEATURES.map((feature) => (
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

      <Section>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ClipboardList className="size-3.5" aria-hidden="true" />
              Kişiselleştirilmiş planlar
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              30 veya 60 günlük beslenme planları
            </h2>
            <p className="text-muted-foreground">
              Kalori, makro ve su hedefleri profil verilerinden deterministik olarak hesaplanır;
              öğün içeriği tercihler, alerjiler ve ilgili sağlık bağlamı dikkate alınarak yapay zekâ
              desteğiyle oluşturulur.
            </p>
            <ul className="space-y-3">
              {[
                "Profiline göre hesaplanan kalori ve makro hedefleri",
                "Alerji ve beslenme tercihlerine duyarlı öğün üretimi",
                "İstediğinde yeni sürüm olarak yeniden oluşturulabilen planlar",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 to-accent/40 p-8 shadow-card">
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
                <TestTube2 className="size-8 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Kan Tahlili Analizi</p>
                  <p className="text-xs text-muted-foreground">
                    Uygun dosyalardan bilgilendirme amaçlı sade özet
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
                <MessageSquareHeart className="size-8 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Yapay Zekâ Beslenme Asistanı</p>
                  <p className="text-xs text-muted-foreground">Profil ve ilgili kayıt bağlamıyla yanıtlar</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
                <Sparkles className="size-8 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Kişisel İçgörüler</p>
                  <p className="text-xs text-muted-foreground">Mevcut kayıtlarından türetilen takip desteği</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section muted>
        <SectionHeading
          eyebrow="Nasıl çalışır"
          title="Üç adımda başla"
          description="Profilini tamamla, kayıtlarını tut ve desteklenen özellikleri ihtiyacına göre kullan."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.step} className="relative rounded-2xl border border-border bg-card p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {step.step}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Neden Diewish"
          title="Tek bir yerde takip ve kişiselleştirme"
          align="center"
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
          {KEY_BENEFITS.map((benefit) => (
            <div
              key={benefit}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">{benefit}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section muted>
        <SectionHeading
          eyebrow="Şeffaflık"
          title="Gerçek kullanıcı yorumları geldikçe burada yer alacak"
          description="Diewish henüz doğrulanmış kullanıcı yorumu yayımlamıyor. Örnek veya kurgusal değerlendirmeleri gerçek müşteri yorumu gibi göstermiyoruz."
        />
      </Section>

      <Section>
        <SectionHeading
          eyebrow="S.S.S."
          title="Sıkça sorulan sorular"
          description="Aradığın yanıtı bulamadıysan bizimle iletişime geçebilirsin."
        />
        <div className="mt-12">
          <FaqAccordion items={FAQ_ITEMS.slice(0, 5)} />
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link href="/faq">Tüm soruları gör</Link>
          </Button>
        </div>
      </Section>

      <CtaSection />
    </>
  );
}
