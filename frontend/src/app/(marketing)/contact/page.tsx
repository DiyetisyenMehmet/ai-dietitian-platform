import type { Metadata } from "next";
import { AlertTriangle, Building2, Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";

import {
  BUSINESS_INFO_COMPLETE,
  BUSINESS_INFO_MISSING_FIELDS,
  CONTACT_INFO,
  PUBLIC_BUSINESS_INFO,
} from "@/shared/constants/site";
import { Section } from "@/presentation/components/marketing/section";
import { ContactForm } from "@/presentation/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "İletişim ve Ticari Bilgiler",
  description:
    "Diewish iletişim, destek ve yasal ticari işletme bilgileri.",
  alternates: { canonical: "/contact" },
};

function Value({ children }: { children: React.ReactNode }) {
  return <p className="break-words text-sm text-muted-foreground">{children || "—"}</p>;
}

/** Public contact + statutory merchant identity page served at `/contact`. */
export default function ContactPage() {
  const isTacir = PUBLIC_BUSINESS_INFO.entityType === "TACIR";
  const isEsnaf = PUBLIC_BUSINESS_INFO.entityType === "ESNAF";

  return (
    <Section>
      <div className="space-y-10">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="space-y-3">
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                İletişim
              </span>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bizimle iletişime geç</h1>
              <p className="text-muted-foreground">
                Soruların, önerilerin, ödeme veya veri sahibi başvuruların için aşağıdaki kanallardan bize ulaşabilirsin.
              </p>
            </div>

            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                  <Mail className="size-5 text-primary" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">E-posta</p>
                  <a href={`mailto:${CONTACT_INFO.email}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {CONTACT_INFO.email}
                  </a>
                </div>
              </li>
              {CONTACT_INFO.phone && (
                <li className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <Phone className="size-5 text-primary" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Telefon</p>
                    <a href={`tel:${CONTACT_INFO.phone.replace(/\s/g, "")}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {CONTACT_INFO.phone}
                    </a>
                  </div>
                </li>
              )}
              <li className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                  <Clock className="size-5 text-primary" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Destek</p>
                  <Value>{CONTACT_INFO.supportHours}</Value>
                </div>
              </li>
              {PUBLIC_BUSINESS_INFO.registeredAddress && (
                <li className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <MapPin className="size-5 text-primary" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Merkez adresi</p>
                    <Value>{PUBLIC_BUSINESS_INFO.registeredAddress}</Value>
                  </div>
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
            <ContactForm />
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-bold">Ticari ve yasal bilgiler</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Elektronik ticaret, ödeme ve veri koruma süreçlerinde kullanılacak kamuya açık işletme kimliği.
              </p>
            </div>
          </div>

          {!BUSINESS_INFO_COMPLETE && (
            <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
              <div>
                <p className="font-semibold">Production ticari kimliği henüz tamamlanmadı</p>
                <p className="mt-1 text-muted-foreground">
                  iyzico production başvurusu gönderilmeden önce şu alanlar gerçek bilgilerle yapılandırılmalıdır: {BUSINESS_INFO_MISSING_FIELDS.join(", ")}.
                </p>
              </div>
            </div>
          )}

          <dl className="grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticari unvan / ad soyad</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.legalName}</Value></dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marka</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.brandName}</Value></dd></div>
            {isTacir && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MERSİS</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.mersisNumber}</Value></dd></div>}
            {isEsnaf && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vergi kimlik numarası</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.taxNumber}</Value></dd></div>}
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">KEP</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.kepAddress}</Value></dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-posta</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.email}</Value></dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefon</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.phone}</Value></dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meslek odası</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.chamberName}</Value></dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merkez adresi</dt><dd className="mt-1"><Value>{PUBLIC_BUSINESS_INFO.registeredAddress}</Value></dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meslek kuralları / oda bilgisi</dt>
              <dd className="mt-1">
                {PUBLIC_BUSINESS_INFO.chamberRulesUrl ? (
                  <a href={PUBLIC_BUSINESS_INFO.chamberRulesUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    İlgili kurallara ve oda bilgilerine ulaş <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : <Value>{""}</Value>}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </Section>
  );
}
