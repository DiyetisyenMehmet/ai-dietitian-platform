import { BloodTestCard } from "@/presentation/components/dashboard/blood-test-card";
import type { BloodTestCardLocale } from "@/presentation/components/dashboard/blood-test-card-contract";
import { DashboardLiveFeatureCard } from "@/presentation/components/dashboard/dashboard-live-feature-card";
import type {
  DashboardLiveFeatureCardKind,
  DashboardLiveFeatureCardLocale,
} from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

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

/**
 * Dashboard feature cards deliberately keep theme geometry immutable.
 *
 * Blood Test, Food/Barcode and Progress all use fixed-coordinate live text.
 * Global i18n is intentionally out of scope; locale is still an explicit
 * presentation input so the future language system can connect without
 * rebuilding these cards.
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
      <div className="space-y-[clamp(0.45rem,1.8vw,0.8rem)] dark:hidden">
        {FEATURES.map((feature) =>
          feature.kind === "blood" ? (
            <BloodTestCard
              key={`light-${feature.href}`}
              href={feature.href}
              locale={bloodTestLocale}
              theme="light"
            />
          ) : isLiveFeatureKind(feature.kind) ? (
            <DashboardLiveFeatureCard
              key={`light-${feature.href}`}
              kind={feature.kind}
              href={feature.href}
              locale={resolvedFeatureLocale}
              theme="light"
            />
          ) : null,
        )}
      </div>

      <div className="hidden space-y-[clamp(0.45rem,1.8vw,0.8rem)] dark:block">
        {FEATURES.map((feature) =>
          feature.kind === "blood" ? (
            <BloodTestCard
              key={`dark-${feature.href}`}
              href={feature.href}
              locale={bloodTestLocale}
              theme="dark"
            />
          ) : isLiveFeatureKind(feature.kind) ? (
            <DashboardLiveFeatureCard
              key={`dark-${feature.href}`}
              kind={feature.kind}
              href={feature.href}
              locale={resolvedFeatureLocale}
              theme="dark"
            />
          ) : null,
        )}
      </div>
    </section>
  );
}
