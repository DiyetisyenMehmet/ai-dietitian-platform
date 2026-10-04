import Link from "next/link";
import { useId } from "react";

import { DashboardCardArtwork } from "./dashboard-card-artwork";
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
  const backgroundClipId = `blood-background-${useId()}`;
  return (
    <div
      className="dashboard-feature-card dashboard-blood-card"
      data-blood-test-card
      data-dashboard-responsive-surface=""
      data-locale={locale}
      data-theme={theme}
    >
      <svg
        className="dashboard-blood-background"
        viewBox="4 28 1428 358"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        data-blood-test-background
      >
        <defs>
          <clipPath id={backgroundClipId} clipPathUnits="userSpaceOnUse">
            {/* Copy only the bottom waves. The source icon, panel and tube must
                never appear behind the live content when the summary wraps. */}
            <path
              d={
                theme === "dark"
                  ? "M4 300C185 298 325 325 449 365C536 408 623 302 768 298V386H4Z"
                  : "M4 299C112 299 172 363 267 386H4Z M510 386C605 355 668 299 768 296V386Z"
              }
            />
          </clipPath>
        </defs>
        <image
          href={BLOOD_TEST_CARD_BASE[theme]}
          width={BLOOD_TEST_CARD_VIEWBOX.width}
          height={BLOOD_TEST_CARD_VIEWBOX.height}
          clipPath={`url(#${backgroundClipId})`}
        />
      </svg>
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
        <div className="dashboard-blood-summary" data-blood-test-summary>
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
          <div className="dashboard-blood-tube" data-blood-test-tube aria-hidden="true">
            <DashboardCardArtwork
              src={BLOOD_TEST_CARD_BASE[theme]}
              source={BLOOD_TEST_CARD_VIEWBOX}
              region={BLOOD_TEST_CARD_REGIONS.tube}
              preserveAspectRatio="none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
