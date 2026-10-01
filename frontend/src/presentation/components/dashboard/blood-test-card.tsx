import type { CSSProperties } from "react";

import Image from "next/image";
import Link from "next/link";

import { DashboardCardNightBorder } from "@/presentation/components/dashboard/dashboard-card-night-border";
import { DashboardFeatureChevron } from "@/presentation/components/dashboard/dashboard-feature-chevron";

import {
  BLOOD_TEST_CARD_ASPECT,
  BLOOD_TEST_CARD_BASE,
  BLOOD_TEST_CARD_COLORS,
  BLOOD_TEST_CARD_COPY,
  BLOOD_TEST_CARD_LAYOUT,
  BLOOD_TEST_CARD_VALUES,
  BLOOD_TEST_CARD_VIEWBOX,
  type BloodTestCardLocale,
  type BloodTestCardTheme,
} from "@/presentation/components/dashboard/blood-test-card-contract";
import { DASHBOARD_FEATURE_CARD_FRAME_ASPECT } from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

interface BloodTestCardProps {
  href?: string;
  locale?: BloodTestCardLocale;
  theme: BloodTestCardTheme;
}

type Anchor = "start" | "middle" | "end";

const BLOOD_TEST_VISIBLE_CROP = {
  top: 35,
  height: 342,
} as const;

function bloodStageStyle(): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: `${-(BLOOD_TEST_VISIBLE_CROP.top / BLOOD_TEST_VISIBLE_CROP.height) * 100}%`,
    width: "100%",
    aspectRatio: BLOOD_TEST_CARD_ASPECT,
  };
}

function designTextStyle({
  x,
  y,
  fontSize,
  fontWeight,
  anchor = "start",
}: {
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  anchor?: Anchor;
}): CSSProperties {
  const style: CSSProperties = {
    position: "absolute",
    top: `${(y / BLOOD_TEST_CARD_VIEWBOX.height) * 100}%`,
    fontFamily: "var(--font-sans), Inter, sans-serif",
    fontSize: `${(fontSize / BLOOD_TEST_CARD_VIEWBOX.width) * 100}cqw`,
    fontWeight,
    lineHeight: 1,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "manipulation",
  };

  if (anchor === "end") {
    style.right = `${((BLOOD_TEST_CARD_VIEWBOX.width - x) / BLOOD_TEST_CARD_VIEWBOX.width) * 100}%`;
    style.transform = "translateY(-50%)";
  } else if (anchor === "middle") {
    style.left = `${(x / BLOOD_TEST_CARD_VIEWBOX.width) * 100}%`;
    style.transform = "translate(-50%, -50%)";
  } else {
    style.left = `${(x / BLOOD_TEST_CARD_VIEWBOX.width) * 100}%`;
    style.transform = "translateY(-50%)";
  }

  return style;
}

function HtmlText({
  x,
  y,
  children,
  color,
  fontSize,
  fontWeight,
  anchor = "start",
  row,
}: {
  x: number;
  y: number;
  children: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  anchor?: Anchor;
  row?: number;
}) {
  return (
    <span
      className="pointer-events-none z-20 select-none"
      style={{
        ...designTextStyle({ x, y, fontSize, fontWeight, anchor }),
        color,
      }}
      aria-hidden="true"
      data-blood-test-live-text
      data-selectable-text="false"
      data-dashboard-decorative-text=""
      data-blood-test-row={row}
    >
      {children}
    </span>
  );
}

/**
 * Blood Test keeps its native 1438 x 413 artwork and text coordinates while
 * sharing the same visible 21:5 outer frame as Food and Progress. The source
 * stage is uniformly scaled and only surplus vertical canvas is clipped.
 */
export function BloodTestCard({
  href = "/profile/blood-tests",
  locale = "tr",
  theme,
}: BloodTestCardProps) {
  const copy = BLOOD_TEST_CARD_COPY[locale];
  const colors = BLOOD_TEST_CARD_COLORS[theme];
  const layout = BLOOD_TEST_CARD_LAYOUT;
  const accessibleName = [
    copy.title,
    copy.description.join(" "),
    copy.panelTitle,
    copy.status,
    ...copy.labels.map((label, index) => `${label}: ${BLOOD_TEST_CARD_VALUES[index]}`),
  ].join(". ");

  return (
    <div
      className="relative block w-full overflow-hidden rounded-[clamp(0.9rem,3.6cqw,1.35rem)] bg-transparent [container-type:inline-size]"
      style={{ aspectRatio: DASHBOARD_FEATURE_CARD_FRAME_ASPECT }}
      data-blood-test-card
      data-dashboard-fixed-geometry=""
      data-locale={locale}
      data-theme={theme}
      data-theme-geometry="locked"
      data-frame-aspect="21:5"
      data-text-layer="html"
    >
      <div
        className="absolute [container-type:inline-size]"
        style={bloodStageStyle()}
        data-blood-test-stage
      >
        <Link
          href={href}
          className="absolute inset-0 z-10 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-label={accessibleName}
          data-blood-test-link
        >
          <Image
            src={BLOOD_TEST_CARD_BASE[theme]}
            alt=""
            fill
            unoptimized
            draggable={false}
            sizes="(max-width: 768px) 100vw, 672px"
            className="pointer-events-none select-none object-fill"
            aria-hidden="true"
            data-blood-test-base-visual
          />
        </Link>

        <HtmlText
          x={layout.title.x}
          y={layout.title.y}
          color={colors.title}
          fontSize={layout.title.fontSize}
          fontWeight={layout.title.fontWeight}
        >
          {copy.title}
        </HtmlText>

        <HtmlText
          x={layout.description.x}
          y={layout.description.firstY}
          color={colors.description}
          fontSize={layout.description.fontSize}
          fontWeight={layout.description.fontWeight}
        >
          {copy.description[0]}
        </HtmlText>

        <HtmlText
          x={layout.description.x}
          y={layout.description.secondY}
          color={colors.description}
          fontSize={layout.description.fontSize}
          fontWeight={layout.description.fontWeight}
        >
          {copy.description[1]}
        </HtmlText>

        <HtmlText
          x={layout.panelTitle.x}
          y={layout.panelTitle.y}
          color={colors.panelTitle}
          fontSize={layout.panelTitle.fontSize}
          fontWeight={layout.panelTitle.fontWeight}
        >
          {copy.panelTitle}
        </HtmlText>

        <HtmlText
          x={layout.status.x}
          y={layout.status.y}
          color={colors.status}
          fontSize={layout.status.fontSize}
          fontWeight={layout.status.fontWeight}
          anchor="middle"
        >
          {copy.status}
        </HtmlText>


        {copy.labels.map((label, index) => (
          <span key={label}>
            <HtmlText
              x={layout.rows.labelX}
              y={layout.rows.y[index]}
              color={colors.label}
              fontSize={layout.rows.labelFontSize}
              fontWeight={layout.rows.labelWeight}
              row={index + 1}
            >
              {label}
            </HtmlText>
            <HtmlText
              x={layout.rows.valueX}
              y={layout.rows.y[index]}
              color={colors.value}
              fontSize={layout.rows.valueFontSize}
              fontWeight={layout.rows.valueWeight}
              anchor="end"
              row={index + 1}
            >
              {BLOOD_TEST_CARD_VALUES[index]}
            </HtmlText>
          </span>
        ))}
      </div>

      <DashboardFeatureChevron />
      <DashboardCardNightBorder />
    </div>
  );
}
