import type { CSSProperties } from "react";

import Image from "next/image";
import Link from "next/link";

import { DashboardCardNightBorder } from "@/presentation/components/dashboard/dashboard-card-night-border";
import { DashboardFeatureChevron } from "@/presentation/components/dashboard/dashboard-feature-chevron";

import {
  DASHBOARD_FEATURE_CARD_FRAME_ASPECT,
  DASHBOARD_LIVE_FEATURE_CARD_ASPECT,
  DASHBOARD_LIVE_FEATURE_CARD_BASE,
  DASHBOARD_LIVE_FEATURE_CARD_COPY,
  DASHBOARD_LIVE_FEATURE_CARD_CROP,
  DASHBOARD_LIVE_FEATURE_CARD_LAYOUT,
  DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX,
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
  type DashboardLiveFeatureCardTheme,
} from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

interface DashboardLiveFeatureCardProps {
  kind: DashboardLiveFeatureCardKind;
  href: string;
  locale?: DashboardLiveFeatureCardLocale;
}

function featureStageStyle(
  kind: DashboardLiveFeatureCardKind,
  theme: DashboardLiveFeatureCardTheme,
): CSSProperties {
  const crop = DASHBOARD_LIVE_FEATURE_CARD_CROP[kind][theme];
  return {
    position: "absolute",
    left: `${-(crop.left / crop.width) * 100}%`,
    top: `${-(crop.top / crop.height) * 100}%`,
    width: `${(DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width / crop.width) * 100}%`,
    aspectRatio: DASHBOARD_LIVE_FEATURE_CARD_ASPECT,
  };
}

function visibleTextStyle({
  kind,
  x,
  y,
  fontSize,
  fontWeight,
}: {
  kind: DashboardLiveFeatureCardKind;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
}): CSSProperties {
  // Text stays locked to the visible frame. Use the dark crop as the canonical
  // coordinate projection because dark is the approved alignment reference.
  const crop = DASHBOARD_LIVE_FEATURE_CARD_CROP[kind].dark;
  return {
    position: "absolute",
    left: `${((x - crop.left) / crop.width) * 100}%`,
    top: `${((y - crop.top) / crop.height) * 100}%`,
    transform: "translateY(-50%)",
    fontFamily: "var(--font-sans), Inter, sans-serif",
    fontSize: `${(fontSize / crop.width) * 100}cqw`,
    fontWeight,
    lineHeight: 1,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "manipulation",
  };
}

function HtmlText({
  kind,
  x,
  y,
  children,
  fontSize,
  fontWeight,
  className,
}: {
  kind: DashboardLiveFeatureCardKind;
  x: number;
  y: number;
  children: string;
  fontSize: number;
  fontWeight: number;
  className: string;
}) {
  return (
    <span
      className={`pointer-events-none z-30 select-none ${className}`}
      style={visibleTextStyle({ kind, x, y, fontSize, fontWeight })}
      aria-hidden="true"
      data-dashboard-live-feature-text
      data-selectable-text="false"
      data-dashboard-decorative-text
      data-text-space="visible-frame"
    >
      {children}
    </span>
  );
}

function ThemeArtwork({
  kind,
  theme,
}: {
  kind: DashboardLiveFeatureCardKind;
  theme: DashboardLiveFeatureCardTheme;
}) {
  return (
    <div
      className={
        theme === "light"
          ? "absolute z-0 dark:hidden"
          : "absolute z-0 hidden dark:block"
      }
      style={featureStageStyle(kind, theme)}
      aria-hidden="true"
      data-dashboard-live-feature-stage
      data-theme={theme}
    >
      <Image
        src={DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme]}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes="(max-width: 768px) 110vw, 740px"
        className="pointer-events-none select-none object-fill"
        data-dashboard-live-feature-base
        data-theme={theme}
      />
    </div>
  );
}


function ProgressLightIconNormalizer() {
  return (
    <span
      className="pointer-events-none absolute inset-0 z-20 dark:hidden"
      aria-hidden="true"
      data-progress-light-icon-normalizer
    >
      <span className="absolute left-[0.8%] top-[19%] h-[62%] w-[16.5%] bg-[linear-gradient(90deg,#ffffff_0%,#fbfffd_58%,#f4fdf9_100%)]" />
      <span className="absolute left-[2.8%] top-[24.3%] flex h-[53.4%] w-[12.7%] items-center justify-center rounded-[2.2cqw] bg-[#e8f8f1]/95">
        <span className="flex h-[48%] items-end gap-[0.8cqw]">
          <span className="h-[46%] w-[1.65cqw] rounded-[0.25cqw] bg-[#0aa77b]" />
          <span className="h-[67%] w-[1.65cqw] rounded-[0.25cqw] bg-[#0aa77b]" />
          <span className="h-full w-[1.65cqw] rounded-[0.25cqw] bg-[#0aa77b]" />
        </span>
      </span>
    </span>
  );
}


function DarkArtworkEdgeMask({ kind }: { kind: DashboardLiveFeatureCardKind }) {
  if (kind === "food") {
    return (
      <span
        className="pointer-events-none absolute inset-0 z-20 hidden dark:block"
        aria-hidden="true"
        data-dashboard-dark-edge-mask="food"
      >
        <span
          className="absolute inset-x-0 bottom-0 h-[5%]"
          style={{
            background:
              "linear-gradient(to top, rgba(5,24,27,1) 0%, rgba(5,24,27,0.98) 38%, rgba(5,24,27,0) 100%)",
          }}
        />
      </span>
    );
  }

  return (
    <span
      className="pointer-events-none absolute inset-0 z-20 hidden dark:block"
      aria-hidden="true"
      data-dashboard-dark-edge-mask="progress"
    >
      <span
        className="absolute inset-y-0 left-0 w-[1.35%]"
        style={{
          background:
            "linear-gradient(to right, rgba(5,24,27,1) 0%, rgba(5,24,27,0.98) 42%, rgba(5,24,27,0) 100%)",
        }}
      />
      <span
        className="absolute inset-x-0 bottom-0 h-[5%]"
        style={{
          background:
            "linear-gradient(to top, rgba(5,24,27,1) 0%, rgba(5,24,27,0.98) 38%, rgba(5,24,27,0) 100%)",
        }}
      />
    </span>
  );
}

/**
 * Food/Barcode and Progress share one immutable 21:5 outer frame.
 *
 * Light and dark artwork may have slightly different internal source placement,
 * so each theme gets its own crop transform while the frame and HTML text never
 * move. Progress light is shifted left to match the approved dark alignment.
 * A shared chevron overlay gives both themes the same size and position.
 */
export function DashboardLiveFeatureCard({
  kind,
  href,
  locale = "tr",
}: DashboardLiveFeatureCardProps) {
  const copy = DASHBOARD_LIVE_FEATURE_CARD_COPY[kind][locale];
  const layout = DASHBOARD_LIVE_FEATURE_CARD_LAYOUT[kind];
  const accessibleName = `${copy.title}. ${copy.description.join(" ")}`;

  return (
    <div
      className="relative block w-full overflow-hidden rounded-[clamp(0.9rem,3.6cqw,1.35rem)] bg-transparent [container-type:inline-size]"
      style={{ aspectRatio: DASHBOARD_FEATURE_CARD_FRAME_ASPECT }}
      data-dashboard-live-feature-card
      data-dashboard-fixed-geometry
      data-kind={kind}
      data-locale={locale}
      data-theme-geometry="locked"
      data-frame-aspect="21:5"
      data-text-layer="html-visible-frame"
    >
      <ThemeArtwork kind={kind} theme="light" />
      <ThemeArtwork kind={kind} theme="dark" />

      <Link
        href={href}
        className="absolute inset-0 z-10 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={accessibleName}
        data-dashboard-live-feature-link
      />

      {kind === "progress" && <ProgressLightIconNormalizer />}
      <DarkArtworkEdgeMask kind={kind} />
      <DashboardFeatureChevron />
      <DashboardCardNightBorder />

      <HtmlText
        kind={kind}
        x={layout.x}
        y={layout.titleY}
        fontSize={layout.titleFontSize[locale]}
        fontWeight={layout.titleWeight}
        className="text-[#111b3b] tracking-[-0.01em] dark:text-[#f7fbfa]"
      >
        {copy.title}
      </HtmlText>

      <HtmlText
        kind={kind}
        x={layout.x}
        y={layout.descriptionFirstY}
        fontSize={layout.descriptionFontSize}
        fontWeight={layout.descriptionWeight}
        className="text-[#667895] dark:text-[#b8cedf]"
      >
        {copy.description[0]}
      </HtmlText>

      <HtmlText
        kind={kind}
        x={layout.x}
        y={layout.descriptionSecondY}
        fontSize={layout.descriptionFontSize}
        fontWeight={layout.descriptionWeight}
        className="text-[#667895] dark:text-[#b8cedf]"
      >
        {copy.description[1]}
      </HtmlText>
    </div>
  );
}
