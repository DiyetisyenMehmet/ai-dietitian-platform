import Link from "next/link";

import { DashboardCardArtwork } from "./dashboard-card-artwork";
import { DashboardFeatureChevron } from "./dashboard-feature-chevron";
import {
  DASHBOARD_LIVE_FEATURE_CARD_BASE,
  DASHBOARD_LIVE_FEATURE_CARD_COPY,
  DASHBOARD_LIVE_FEATURE_CARD_FULL_REGIONS,
  DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX,
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
} from "./dashboard-live-feature-card-contract";

interface DashboardLiveFeatureCardProps {
  kind: DashboardLiveFeatureCardKind;
  href: string;
  locale?: DashboardLiveFeatureCardLocale;
}

/** Compact copy/artwork columns wrap only when their preferred widths do not fit. */
export function DashboardLiveFeatureCard({
  kind,
  href,
  locale = "tr",
}: DashboardLiveFeatureCardProps) {
  const copy = DASHBOARD_LIVE_FEATURE_CARD_COPY[kind][locale];
  return (
    <div
      className="dashboard-feature-card"
      data-dashboard-live-feature-card
      data-dashboard-responsive-surface=""
      data-kind={kind}
      data-locale={locale}
    >
      <Link
        href={href}
        className="dashboard-card-link"
        aria-label={`${copy.title}. ${copy.description.join(" ")}`}
        data-dashboard-live-feature-link
      />
      <div className="dashboard-card-base-visual" aria-hidden="true">
        {(["light", "dark"] as const).map((theme) => (
          <DashboardCardArtwork
            key={theme}
            src={DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme]}
            source={DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX}
            region={DASHBOARD_LIVE_FEATURE_CARD_FULL_REGIONS[kind][theme]}
            preserveAspectRatio="none"
            className={theme === "light" ? "block dark:hidden" : "hidden dark:block"}
          />
        ))}
      </div>
      <div
        className="dashboard-card-copy"
        data-dashboard-decorative-text=""
        aria-hidden="true"
      >
        <h3 className="dashboard-card-title" data-dashboard-live-feature-text>
          {copy.title}
        </h3>
        <p className="dashboard-card-description" data-dashboard-live-feature-text>
          {copy.description.join(" ")}
        </p>
      </div>
      <DashboardFeatureChevron />
    </div>
  );
}
