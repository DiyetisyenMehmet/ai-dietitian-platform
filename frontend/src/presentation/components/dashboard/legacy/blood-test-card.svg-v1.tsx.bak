import Image from "next/image";
import Link from "next/link";

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

interface BloodTestCardProps {
  href?: string;
  locale?: BloodTestCardLocale;
  theme: BloodTestCardTheme;
}

function SvgText({
  x,
  y,
  children,
  fill,
  fontSize,
  fontWeight,
  anchor = "start",
  rtl = false,
  numeric = false,
}: {
  x: number;
  y: number;
  children: string;
  fill: string;
  fontSize: number;
  fontWeight: number;
  anchor?: "start" | "middle" | "end";
  rtl?: boolean;
  numeric?: boolean;
}) {
  const fontFamily =
    rtl && !numeric ? "var(--font-arabic), sans-serif" : "var(--font-sans), Inter, sans-serif";

  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontFamily={fontFamily}
      fontSize={fontSize}
      fontWeight={fontWeight}
      textAnchor={anchor}
      dominantBaseline="middle"
      direction={numeric ? "ltr" : rtl ? "rtl" : "ltr"}
      style={{ unicodeBidi: numeric ? "isolate" : "plaintext" }}
    >
      {children}
    </text>
  );
}

/**
 * Pixel-locked Blood Test dashboard card.
 *
 * The approved artwork is exactly one immutable, text-free base visual. Every
 * user-facing string is live SVG text in the same fixed coordinate system, so
 * responsive scaling cannot make artwork and typography drift independently.
 */
export function BloodTestCard({
  href = "/profile/blood-tests",
  locale = "tr",
  theme,
}: BloodTestCardProps) {
  const copy = BLOOD_TEST_CARD_COPY[locale];
  const colors = BLOOD_TEST_CARD_COLORS[theme];
  const rtl = locale === "ar";
  const layout = BLOOD_TEST_CARD_LAYOUT;
  const accessibleName = [
    copy.title,
    copy.description.join(" "),
    copy.panelTitle,
    copy.status,
    ...copy.labels.map((label, index) => `${label}: ${BLOOD_TEST_CARD_VALUES[index]}`),
  ].join(". ");

  return (
    <Link
      href={href}
      className="relative block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: BLOOD_TEST_CARD_ASPECT }}
      aria-label={accessibleName}
      data-blood-test-card
      data-locale={locale}
      data-theme={theme}
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

      <svg
        viewBox={`0 0 ${BLOOD_TEST_CARD_VIEWBOX.width} ${BLOOD_TEST_CARD_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
        data-blood-test-live-text
      >
        <SvgText
          x={rtl ? layout.title.rtlX : layout.title.x}
          y={layout.title.y}
          fill={colors.title}
          fontSize={layout.title.fontSize}
          fontWeight={layout.title.fontWeight}
          anchor={rtl ? "end" : "start"}
          rtl={rtl}
        >
          {copy.title}
        </SvgText>

        <SvgText
          x={rtl ? layout.description.rtlX : layout.description.x}
          y={layout.description.firstY}
          fill={colors.description}
          fontSize={layout.description.fontSize}
          fontWeight={layout.description.fontWeight}
          anchor={rtl ? "end" : "start"}
          rtl={rtl}
        >
          {copy.description[0]}
        </SvgText>
        <SvgText
          x={rtl ? layout.description.rtlX : layout.description.x}
          y={layout.description.secondY}
          fill={colors.description}
          fontSize={layout.description.fontSize}
          fontWeight={layout.description.fontWeight}
          anchor={rtl ? "end" : "start"}
          rtl={rtl}
        >
          {copy.description[1]}
        </SvgText>

        <SvgText
          x={rtl ? layout.panelTitle.rtlX : layout.panelTitle.x}
          y={layout.panelTitle.y}
          fill={colors.panelTitle}
          fontSize={layout.panelTitle.fontSize}
          fontWeight={layout.panelTitle.fontWeight}
          anchor={rtl ? "end" : "start"}
          rtl={rtl}
        >
          {copy.panelTitle}
        </SvgText>

        <SvgText
          x={layout.status.x}
          y={layout.status.y}
          fill={colors.status}
          fontSize={layout.status.fontSize}
          fontWeight={layout.status.fontWeight}
          anchor="middle"
          rtl={rtl}
        >
          {copy.status}
        </SvgText>

        {copy.labels.map((label, index) => (
          <g key={label} data-blood-test-row={index + 1}>
            <SvgText
              x={rtl ? layout.rows.rtlLabelX : layout.rows.labelX}
              y={layout.rows.y[index]}
              fill={colors.label}
              fontSize={layout.rows.labelFontSize}
              fontWeight={layout.rows.labelWeight}
              anchor={rtl ? "end" : "start"}
              rtl={rtl}
            >
              {label}
            </SvgText>
            <SvgText
              x={layout.rows.valueX}
              y={layout.rows.y[index]}
              fill={colors.value}
              fontSize={layout.rows.valueFontSize}
              fontWeight={layout.rows.valueWeight}
              anchor="end"
              numeric
            >
              {BLOOD_TEST_CARD_VALUES[index]}
            </SvgText>
          </g>
        ))}
      </svg>
    </Link>
  );
}
