import Image from "next/image";
import Link from "next/link";

import {
  DASHBOARD_LIVE_FEATURE_CARD_ASPECT,
  DASHBOARD_LIVE_FEATURE_CARD_BASE,
  DASHBOARD_LIVE_FEATURE_CARD_COLORS,
  DASHBOARD_LIVE_FEATURE_CARD_COPY,
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
  theme: DashboardLiveFeatureCardTheme;
}

function SvgText({
  x,
  y,
  children,
  fill,
  fontSize,
  fontWeight,
  className,
}: {
  x: number;
  y: number;
  children: string;
  fill: string;
  fontSize: number;
  fontWeight: number;
  className?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontFamily="var(--font-sans), Inter, sans-serif"
      fontSize={fontSize}
      fontWeight={fontWeight}
      textAnchor="start"
      dominantBaseline="middle"
      className={className}
    >
      {children}
    </text>
  );
}

/**
 * Pixel-locked Food/Barcode and Progress dashboard card.
 *
 * Light and dark use the same 1536 × 512 coordinate system, the same text
 * coordinates and the same responsive aspect ratio. Only the approved base
 * visual and text palette change with theme, so theme switching cannot move
 * the card or its live text.
 */
export function DashboardLiveFeatureCard({
  kind,
  href,
  locale = "tr",
  theme,
}: DashboardLiveFeatureCardProps) {
  const copy = DASHBOARD_LIVE_FEATURE_CARD_COPY[kind][locale];
  const colors = DASHBOARD_LIVE_FEATURE_CARD_COLORS[theme];
  const layout = DASHBOARD_LIVE_FEATURE_CARD_LAYOUT[kind];
  const accessibleName = `${copy.title}. ${copy.description.join(" ")}`;

  return (
    <Link
      href={href}
      className="relative block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: DASHBOARD_LIVE_FEATURE_CARD_ASPECT }}
      aria-label={accessibleName}
      data-dashboard-live-feature-card
      data-kind={kind}
      data-locale={locale}
      data-theme={theme}
    >
      <Image
        src={DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme]}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes="(max-width: 768px) 100vw, 672px"
        className="pointer-events-none select-none object-fill"
        aria-hidden="true"
        data-dashboard-live-feature-base
      />

      <svg
        viewBox={`0 0 ${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width} ${DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
        data-dashboard-live-feature-text
      >
        <SvgText
          x={layout.x}
          y={layout.titleY}
          fill={colors.title}
          fontSize={layout.titleFontSize[locale]}
          fontWeight={layout.titleWeight}
          className="tracking-[-0.01em]"
        >
          {copy.title}
        </SvgText>

        <SvgText
          x={layout.x}
          y={layout.descriptionFirstY}
          fill={colors.description}
          fontSize={layout.descriptionFontSize}
          fontWeight={layout.descriptionWeight}
        >
          {copy.description[0]}
        </SvgText>

        <SvgText
          x={layout.x}
          y={layout.descriptionSecondY}
          fill={colors.description}
          fontSize={layout.descriptionFontSize}
          fontWeight={layout.descriptionWeight}
        >
          {copy.description[1]}
        </SvgText>
      </svg>
    </Link>
  );
}
