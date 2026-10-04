import type { CSSProperties } from "react";

import Link from "next/link";

import {
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

type Anchor = "start" | "middle" | "end";

const BLOOD_TEST_VISIBLE_CROP = {
  dark: { top: 35, height: 342 },
} as const;

function visibleTop(y: number, theme: BloodTestCardTheme) {
  if (theme === "light") {
    return (y / BLOOD_TEST_CARD_VIEWBOX.light.height) * 100;
  }
  const crop = BLOOD_TEST_VISIBLE_CROP.dark;
  return ((y - crop.top) / crop.height) * 100;
}

function clampFont(fontSize: number, theme: BloodTestCardTheme) {
  const width = BLOOD_TEST_CARD_VIEWBOX[theme].width;
  const preferred = (fontSize / width) * 100;
  const minimum = Math.max(4.5, fontSize * 0.19);
  const maximum = Math.max(minimum, fontSize * 0.25);
  return `clamp(${minimum.toFixed(2)}px, ${preferred.toFixed(4)}cqw, ${maximum.toFixed(2)}px)`;
}

function designTextStyle({
  x,
  y,
  fontSize,
  fontWeight,
  anchor = "start",
  theme,
}: {
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
  anchor?: Anchor;
  theme: BloodTestCardTheme;
}): CSSProperties {
  const viewbox = BLOOD_TEST_CARD_VIEWBOX[theme];
  const style: CSSProperties = {
    position: "absolute",
    top: `${visibleTop(y, theme)}%`,
    display: "block",
    fontFamily: "var(--font-sans), Inter, sans-serif",
    fontSize: clampFont(fontSize, theme),
    fontWeight,
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "manipulation",
  };

  if (anchor === "end") {
    style.right = `${((viewbox.width - x) / viewbox.width) * 100}%`;
    style.transform = "translateY(-50%)";
  } else if (anchor === "middle") {
    style.left = `${(x / viewbox.width) * 100}%`;
    style.transform = "translate(-50%, -50%)";
  } else {
    style.left = `${(x / viewbox.width) * 100}%`;
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
  theme,
}: {
  x: number;
  y: number;
  children: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  anchor?: Anchor;
  row?: number;
  theme: BloodTestCardTheme;
}) {
  return (
    <span
      className="pointer-events-none z-20 select-none"
      style={{
        ...designTextStyle({ x, y, fontSize, fontWeight, anchor, theme }),
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
 * Blood Test intentionally uses one base visual only: background, rounded
 * results surface, tube and chevron live in the approved artwork. HTML adds
 * only localized text. This prevents a second rectangular preview layer from
 * appearing in browser or Android WebView.
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
    copy.example,
    copy.panelTitle,
    copy.status,
    ...copy.labels.map((label, index) => `${label}: ${BLOOD_TEST_CARD_VALUES[index]}`),
  ].join(". ");

  return (
    <div
      className="relative block h-[5.25rem] w-full overflow-hidden rounded-[1.125rem] bg-transparent [container-type:inline-size]"
      data-blood-test-card
      data-dashboard-fixed-geometry=""
      data-locale={locale}
      data-theme={theme}
      data-theme-geometry="locked"
      data-frame-height="84px"
      data-text-layer="html"
    >
      <div
        className="pointer-events-none absolute inset-0 select-none bg-[length:100%_100%] bg-no-repeat"
        style={{ backgroundImage: `url("${BLOOD_TEST_CARD_BASE[theme]}")` }}
        aria-hidden="true"
        data-blood-test-base-visual
      />

      <Link
        href={href}
        className="absolute inset-0 z-10 block rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={accessibleName}
        data-blood-test-link
      />

      <HtmlText
        x={layout.title.x}
        y={layout.title.y}
        color={colors.title}
        fontSize={layout.title.fontSize}
        fontWeight={layout.title.fontWeight}
        theme={theme}
      >
        {copy.title}
      </HtmlText>

      <HtmlText
        x={layout.description.x}
        y={layout.description.firstY}
        color={colors.description}
        fontSize={layout.description.fontSize}
        fontWeight={layout.description.fontWeight}
        theme={theme}
      >
        {copy.description[0]}
      </HtmlText>

      <HtmlText
        x={layout.description.x}
        y={layout.description.secondY}
        color={colors.description}
        fontSize={layout.description.fontSize}
        fontWeight={layout.description.fontWeight}
        theme={theme}
      >
        {copy.description[1]}
      </HtmlText>

      <HtmlText
        x={layout.example.x}
        y={layout.example.y}
        color={colors.description}
        fontSize={layout.example.fontSize}
        fontWeight={layout.example.fontWeight}
        theme={theme}
      >
        {copy.example}
      </HtmlText>

      <HtmlText
        x={layout.panelTitle.x}
        y={layout.panelTitle.y}
        color={colors.panelTitle}
        fontSize={layout.panelTitle.fontSize}
        fontWeight={layout.panelTitle.fontWeight}
        theme={theme}
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
        theme={theme}
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
            theme={theme}
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
            theme={theme}
          >
            {BLOOD_TEST_CARD_VALUES[index]}
          </HtmlText>
        </span>
      ))}
    </div>
  );
}
