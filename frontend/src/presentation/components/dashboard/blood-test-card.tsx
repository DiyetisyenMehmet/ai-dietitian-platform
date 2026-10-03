import Link from "next/link";

import { DashboardCardArtwork } from "./dashboard-card-artwork";
import { DashboardFeatureChevron } from "./dashboard-feature-chevron";
import {
  BLOOD_TEST_CARD_BASE,
  BLOOD_TEST_CARD_COPY,
  BLOOD_TEST_CARD_REGIONS,
  BLOOD_TEST_CARD_VALUES,
  BLOOD_TEST_CARD_VIEWBOX,
  type BloodTestCardLocale,
  type BloodTestCardTheme,
} from "./blood-test-card-contract";

interface BloodTestCardProps {
  href?: string;
  locale?: BloodTestCardLocale;
  theme: BloodTestCardTheme;
}

/** Preview rows participate in layout; labels and values never share coordinates. */
export function BloodTestCard({
  href = "/profile/blood-tests",
  locale = "tr",
  theme,
}: BloodTestCardProps) {
  const copy = BLOOD_TEST_CARD_COPY[locale];
  return (
    <div
      className="dashboard-feature-card dashboard-blood-card"
      data-blood-test-card
      data-dashboard-responsive-surface=""
      data-locale={locale}
      data-theme={theme}
    >
      <Link
        href={href}
        className="dashboard-card-link"
        aria-label={`${copy.title}. ${copy.description.join(" ")}`}
        data-blood-test-link
      />
      <div className="dashboard-card-icon" aria-hidden="true">
        <DashboardCardArtwork
          src={BLOOD_TEST_CARD_BASE[theme]}
          source={BLOOD_TEST_CARD_VIEWBOX}
          region={BLOOD_TEST_CARD_REGIONS.icon}
        />
      </div>
      <div className="dashboard-blood-body" data-dashboard-decorative-text="" aria-hidden="true">
        <div className="dashboard-card-copy">
          <h3 className="dashboard-card-title" data-blood-test-live-text>
            {copy.title}
          </h3>
          <p className="dashboard-card-description" data-blood-test-live-text>
            {copy.description.join(" ")}
          </p>
          <span className="dashboard-blood-example" data-blood-test-live-text>
            {copy.example}
          </span>
        </div>
        <div className="dashboard-blood-preview" data-blood-test-preview>
          <div className="dashboard-blood-heading">
            <span className="font-semibold" data-blood-test-live-text>
              {copy.panelTitle}
            </span>
            <span className="dashboard-blood-status" data-blood-test-live-text>
              {copy.status}
            </span>
          </div>
          <dl className="dashboard-blood-rows">
            {copy.labels.map((label, index) => (
              <div className="dashboard-blood-row" key={label} data-blood-test-row={index + 1}>
                <dt data-blood-test-live-text>{label}</dt>
                <dd data-blood-test-live-text>{BLOOD_TEST_CARD_VALUES[index]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <DashboardFeatureChevron />
    </div>
  );
}
