import type { Metadata } from "next";
import { Clock, Mail, MapPin } from "lucide-react";

import { CONTACT_INFO } from "@/shared/constants/site";
import { Section } from "@/presentation/components/marketing/section";
import { ContactForm } from "@/presentation/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "İletişim",
  description:
    "Diewish ile iletişime geç. Sorularını, önerilerini ve destek taleplerini bize ilet; ekibimiz en kısa sürede yanıt versin.",
  alternates: { canonical: "/contact" },
};

/** Public contact page served at `/contact`. */
export default function ContactPage() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-3">
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              İletişim
            </span>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Bizimle iletişime geç</h1>
            <p className="text-muted-foreground">
              Soruların, önerilerin veya destek ihtiyacın için buradayız. Aşağıdaki formu doldur ya
              da doğrudan e-posta gönder.
            </p>
          </div>

          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <Mail className="size-5 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">E-posta</p>
                <a
                  href={`mailto:${CONTACT_INFO.email}`}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {CONTACT_INFO.email}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <Clock className="size-5 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Destek Saatleri</p>
                <p className="text-sm text-muted-foreground">{CONTACT_INFO.supportHours}</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <MapPin className="size-5 text-primary" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Adres</p>
                <p className="text-sm text-muted-foreground">{CONTACT_INFO.addressLine}</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
          <ContactForm />
        </div>
      </div>
    </Section>
  );
}
