import type { Metadata } from "next";
import { HeartPulse, ShieldCheck, Sparkles, Target } from "lucide-react";

import { APP_CONFIG } from "@/shared/constants/app";
import { Section, SectionHeading } from "@/presentation/components/marketing/section";
import { CtaSection } from "@/presentation/components/marketing/cta-section";

export const metadata: Metadata = {
  title: "Hakkımızda",
  description:
    "Diewish, kullanıcıların kendi hesapları üzerinden kullandığı yapay zekâ destekli beslenme ve takip yazılım platformudur.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  {
    icon: Target,
    title: "Kişiselleştirme",
    description: "Kayıtlı profil ve hedefleri dikkate alan, tek tip olmayan yazılım deneyimi.",
  },
  {
    icon: ShieldCheck,
    title: "Güven ve Gizlilik",
    description: "Veri minimizasyonu, hesap bazlı erişim ve açık rıza kontrollerini ürünün parçası olarak ele alırız.",
  },
  {
    icon: HeartPulse,
    title: "Sağlık Güvenliği",
    description: "İçerikler bilgilendirme amaçlıdır; teşhis veya tedavi yerine geçmez ve uzmana başvurmayı teşvik eder.",
  },
  {
    icon: Sparkles,
    title: "Sorumlu Yapay Zekâ",
    description: "Yapay zekâyı beslenme takibini ve bilgiyi anlamayı kolaylaştıran bir yazılım aracı olarak kullanırız.",
  },
];

/** Public about page served at `/about`. */
export default function AboutPage() {
  return (
    <>
      <Section>
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Hakkımızda
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Yapay zekâ destekli beslenme ve takip yazılımı
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            {APP_CONFIG.name}, kullanıcıların kendi hesapları üzerinden kullandığı dijital bir yazılım
            platformudur. Profil, hedef ve kullanıcı tarafından kaydedilen verileri kullanarak beslenme
            planı oluşturma, öğün ve ilerleme takibi, kan tahlili sonuçlarını bilgilendirme amaçlı
            sadeleştirme ve yapay zekâ beslenme asistanı özellikleri sunar. Diewish üzerinden bire bir
            hekim veya diyetisyen danışmanlığı satılmaz.
          </p>
        </div>
      </Section>

      <Section muted>
        <SectionHeading eyebrow="Değerlerimiz" title="Bizi yönlendiren ilkeler" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => (
            <div
              key={value.title}
              className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <value.icon className="size-6 text-primary" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{value.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{value.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 text-center shadow-card">
          <h2 className="text-2xl font-bold tracking-tight">Önemli sağlık notu</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Diewish bir hekim, diyetisyen veya sağlık kuruluşu değildir. Sunulan içerikler yalnızca
            bilgilendirme amaçlıdır ve profesyonel tıbbi tavsiyenin yerine geçmez. Sağlığınla ilgili
            kararlar almadan önce yetkili bir sağlık uzmanına danışmalısın.
          </p>
        </div>
      </Section>

      <CtaSection />
    </>
  );
}
