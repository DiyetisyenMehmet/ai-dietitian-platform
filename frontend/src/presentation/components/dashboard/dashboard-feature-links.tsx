import { BloodTestCard } from "@/presentation/components/dashboard/blood-test-card";
import type { BloodTestCardLocale } from "@/presentation/components/dashboard/blood-test-card-contract";
import { DashboardLiveFeatureCard } from "@/presentation/components/dashboard/dashboard-live-feature-card";
import {
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
} from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

const FEATURES = [
  { kind: "food", href: "/meals/scan" },
  { kind: "blood", href: "/profile/blood-tests" },
  { kind: "progress", href: "/progress" },
] as const;

function isLiveFeatureKind(
  kind: (typeof FEATURES)[number]["kind"],
): kind is DashboardLiveFeatureCardKind {
  return kind === "food" || kind === "progress";
}

function BloodTestThemeSlot({ href, locale }: { href: string; locale: BloodTestCardLocale }) {
  return (
    <div className="w-full" data-blood-test-theme-slot>
      <div className="dark:hidden">
        <BloodTestCard href={href} locale={locale} theme="light" />
      </div>
      <div className="hidden dark:block">
        <BloodTestCard href={href} locale={locale} theme="dark" />
      </div>
    </div>
  );
}

export function DashboardFeatureLinks({
  bloodTestLocale = "tr",
  featureLocale,
}: {
  bloodTestLocale?: BloodTestCardLocale;
  featureLocale?: DashboardLiveFeatureCardLocale;
} = {}) {
  const resolvedFeatureLocale = featureLocale ?? (bloodTestLocale === "en" ? "en" : "tr");

  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="space-y-[clamp(0.65rem,2.2vw,0.95rem)]">
        {FEATURES.map((feature) =>
          feature.kind === "blood" ? (
            <BloodTestThemeSlot key={feature.href} href={feature.href} locale={bloodTestLocale} />
          ) : isLiveFeatureKind(feature.kind) ? (
            <DashboardLiveFeatureCard
              key={feature.href}
              kind={feature.kind}
              href={feature.href}
              locale={resolvedFeatureLocale}
            />
          ) : null,
        )}
      </div>
    </section>
  );
}
