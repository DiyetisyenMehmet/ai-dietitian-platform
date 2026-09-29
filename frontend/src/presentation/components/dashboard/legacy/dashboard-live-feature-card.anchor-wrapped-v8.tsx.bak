import type { CSSProperties } from "react";

import Image from "next/image";
import Link from "next/link";

import {
  DASHBOARD_LIVE_FEATURE_CARD_ASPECT,
  DASHBOARD_LIVE_FEATURE_CARD_BASE,
  DASHBOARD_LIVE_FEATURE_CARD_COPY,
  DASHBOARD_LIVE_FEATURE_CARD_LAYOUT,
  DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX,
  type DashboardLiveFeatureCardKind,
  type DashboardLiveFeatureCardLocale,
} from "@/presentation/components/dashboard/dashboard-live-feature-card-contract";

interface DashboardLiveFeatureCardProps {
  kind: DashboardLiveFeatureCardKind;
  href: string;
  locale?: DashboardLiveFeatureCardLocale;
}

function designTextStyle({
  x,
  y,
  fontSize,
  fontWeight,
}: {
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
}): CSSProperties {
  return {
    position: "absolute",
    left: `${(x / DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width) * 100}%`,
    top: `${(y / DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height) * 100}%`,
    transform: "translateY(-50%)",
    fontFamily: "var(--font-sans), Inter, sans-serif",
    fontSize: `${(fontSize / DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width) * 100}cqw`,
    fontWeight,
    lineHeight: 1,
    whiteSpace: "nowrap",
    pointerEvents: "auto",
    userSelect: "text",
    WebkitUserSelect: "text",
  };
}

function HtmlText({
  x,
  y,
  children,
  fontSize,
  fontWeight,
  className,
}: {
  x: number;
  y: number;
  children: string;
  fontSize: number;
  fontWeight: number;
  className: string;
}) {
  return (
    <span
      className={`z-20 cursor-text select-text ${className}`}
      style={designTextStyle({ x, y, fontSize, fontWeight })}
      data-dashboard-live-feature-text
      data-selectable-text="true"
    >
      {children}
    </span>
  );
}

/**
 * Approved HTML card for Food/Barcode and Progress.
 *
 * The artwork is image-only. Every title/description is real selectable HTML
 * text, not baked into the image and not SVG text. Light and dark base images
 * stay mounted in one immutable 1536 x 512 box, so theme changes cannot alter
 * card geometry or text coordinates.
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
    <Link
      href={href}
      className="relative block w-full overflow-hidden [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: DASHBOARD_LIVE_FEATURE_CARD_ASPECT }}
      aria-label={accessibleName}
      data-dashboard-live-feature-card
      data-kind={kind}
      data-locale={locale}
      data-theme-geometry="locked"
      data-text-layer="html"
    >
      <Image
        src={DASHBOARD_LIVE_FEATURE_CARD_BASE[kind].light}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes="(max-width: 768px) 100vw, 672px"
        className="pointer-events-none select-none object-fill dark:hidden"
        aria-hidden="true"
        data-dashboard-live-feature-base
        data-theme="light"
      />

      <Image
        src={DASHBOARD_LIVE_FEATURE_CARD_BASE[kind].dark}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes="(max-width: 768px) 100vw, 672px"
        className="pointer-events-none hidden select-none object-fill dark:block"
        aria-hidden="true"
        data-dashboard-live-feature-base
        data-theme="dark"
      />

      <HtmlText
        x={layout.x}
        y={layout.titleY}
        fontSize={layout.titleFontSize[locale]}
        fontWeight={layout.titleWeight}
        className="text-[#111b3b] tracking-[-0.01em] dark:text-[#f7fbfa]"
      >
        {copy.title}
      </HtmlText>

      <HtmlText
        x={layout.x}
        y={layout.descriptionFirstY}
        fontSize={layout.descriptionFontSize}
        fontWeight={layout.descriptionWeight}
        className="text-[#667895] dark:text-[#b8cedf]"
      >
        {copy.description[0]}
      </HtmlText>

      <HtmlText
        x={layout.x}
        y={layout.descriptionSecondY}
        fontSize={layout.descriptionFontSize}
        fontWeight={layout.descriptionWeight}
        className="text-[#667895] dark:text-[#b8cedf]"
      >
        {copy.description[1]}
      </HtmlText>
    </Link>
  );
}
