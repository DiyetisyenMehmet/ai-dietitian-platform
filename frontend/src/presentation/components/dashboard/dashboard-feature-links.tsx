import { BloodTestCard } from "@/presentation/components/dashboard/blood-test-card";
import type { BloodTestCardLocale } from "@/presentation/components/dashboard/blood-test-card-contract";
import { DashboardLiveFeatureCard } from "@/presentation/components/dashboard/dashboard-live-feature-card";
import {\n  DASHBOARD_LIVE_FEATURE_CARD_ASPECT,\n  type DashboardLiveFeatureCardKind,\n  type DashboardLiveFeatureCardLocale,\n} from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

const FEATURES = [
  {
    kind: "food",
    href: "/meals/scan",
  },
  {
    kind: "blood",
    href: "/profile/blood-tests",
  },
  {
    kind: "progress",
    href: "/progress",
  },
] as const;

function isLiveFeatureKind(
  kind: (typeof FEATURES)[number]["kind"],
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
      style={{ aspectRatio: DASHBOARD_LIVE_FEATURE_CARD_ASPECT }}
      data-blood-test-theme-slot
    >
      <div className="absolute inset-0 flex items-center dark:hidden">
        <BloodTestCard href={href} locale={locale} theme="light" />
      </div>
      <div className="absolute inset-0 hidden items-center dark:flex">
        <BloodTestCard href={href} locale={locale} theme="dark" />
      </div>
    </div>
  );
}

/**
 * One permanent dashboard stack is used for both themes.
 *
 * Food/Barcode and Progress use the approved HTML-card behavior: both theme
 * visuals stay mounted in one immutable 1536 x 512 geometry and only
 * visibility/colors change. Blood Test keeps its already-approved fixed SVG
 * contract inside one geometry-locked slot.
 */
export function DashboardFeatureLinks({
  bloodTestLocale = "tr",
  featureLocale,
}: {
  bloodTestLocale?: BloodTestCardLocale;
  featureLocale?: DashboardLiveFeatureCardLocale;
} = {}) {
  const resolvedFeatureLocale =
    featureLocale ?? (bloodTestLocale === "en" ? "en" : "tr");

  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="space-y-[clamp(0.45rem,1.8vw,0.8rem)]">
        {FEATURES.map((feature) =>
          feature.kind === "blood" ? (
            <BloodTestThemeSlot
              key={feature.href}
              href={feature.href}
              locale={bloodTestLocale}
            />
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
