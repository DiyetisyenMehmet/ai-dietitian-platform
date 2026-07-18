import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/presentation/components/ui/button";

interface CtaSectionProps {
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

/**
 * Reusable call-to-action band used across marketing pages to drive sign-ups.
 */
export function CtaSection({
  title = "Sağlıklı yaşam yolculuğuna bugün başla",
  description = "Diewish'i ücretsiz dene; hazır olduğunda Premium'a geç. Taahhüt yok, istediğin an iptal et.",
  primaryLabel = "Ücretsiz Başla",
  primaryHref = "/register",
  secondaryLabel = "Planları İncele",
  secondaryHref = "/pricing",
}: CtaSectionProps) {
  return (
    <section className="py-16 sm:py-20">
      <div className="container">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-card sm:px-12">
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
            <p className="text-base text-primary-foreground/90 sm:text-lg">{description}</p>
            <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
              <Button asChild size="lg" variant="secondary">
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
