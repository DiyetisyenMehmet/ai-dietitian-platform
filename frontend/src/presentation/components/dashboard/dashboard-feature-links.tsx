import { BloodTestCard } from "@/presentation/components/dashboard/blood-test-card";
import type { BloodTestCardLocale } from "@/presentation/components/dashboard/blood-test-card-contract";
import { DashboardLiveFeatureCard } from "@/presentation/components/dashboard/dashboard-live-feature-card";
import {
  DASHBOARD_FEATURE_CARD_FRAME_ASPECT,
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
} from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

export const DASHBOARD_FEATURES = [
  { kind: "food", href: "/meals/scan" },
  { kind: "blood", href: "/profile/blood-tests" },
  { kind: "progress", href: "/progress" },
] as const;

export type DashboardFeatureLinkKind = (typeof DASHBOARD_FEATURES)[number]["kind"];

function isLiveFeatureKind(
  kind: (typeof DASHBOARD_FEATURES)[number]["kind"],
): kind is DashboardLiveFeatureCardKind {
  return kind === "food" || kind === "progress";
}

function BloodTestThemeSlot({
  href,
  locale,
}: {
  href: string;
  locale: BloodTestCardLocale;
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: DASHBOARD_FEATURE_CARD_FRAME_ASPECT }}
      data-blood-test-theme-slot
      data-frame-aspect="21:5"
    >
      <div className="absolute inset-0 dark:hidden">
        <BloodTestCard href={href} locale={locale} theme="light" />
      </div>
      <div className="absolute inset-0 hidden dark:block">
        <BloodTestCard href={href} locale={locale} theme="dark" />
      </div>
    </div>
  );
}

export function DashboardFeatureCard({
  kind,
  bloodTestLocale = "tr",
  featureLocale,
}: {
  kind: DashboardFeatureLinkKind;
  bloodTestLocale?: BloodTestCardLocale;
  featureLocale?: DashboardLiveFeatureCardLocale;
}) {
  const feature = DASHBOARD_FEATURES.find((candidate) => candidate.kind === kind);
  if (!feature) return null;
  const resolvedFeatureLocale =
    featureLocale ?? (bloodTestLocale === "en" ? "en" : "tr");

  if (feature.kind === "blood") {
    return <BloodTestThemeSlot href={feature.href} locale={bloodTestLocale} />;
  }
  if (isLiveFeatureKind(feature.kind)) {
    return (
      <DashboardLiveFeatureCard
        kind={feature.kind}
        href={feature.href}
        locale={resolvedFeatureLocale}
      />
    );
  }
  return null;
}

export function DashboardFeatureLinks({
  bloodTestLocale = "tr",
  featureLocale,
}: {
  bloodTestLocale?: BloodTestCardLocale;
  featureLocale?: DashboardLiveFeatureCardLocale;
} = {}) {
  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="space-y-[clamp(0.65rem,2.2vw,0.95rem)]">
        {DASHBOARD_FEATURES.map((feature) => (
          <DashboardFeatureCard
            key={feature.kind}
            kind={feature.kind}
            bloodTestLocale={bloodTestLocale}
            featureLocale={featureLocale}
          />
        ))}
      </div>
    </section>
  );
}
