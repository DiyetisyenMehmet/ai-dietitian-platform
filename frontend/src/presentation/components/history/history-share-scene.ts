import {
  HISTORY_MOTIVATION_MAX_CHARACTERS,
  type HistorySharePayload,
  type HistoryShareVisualCard,
} from "@/application/history/history-share";

export type HistoryShareSceneDensity = "sparse" | "balanced" | "dense";

export interface HistoryShareSceneDetail {
  title: string;
  lines: readonly string[];
}

export interface HistoryShareScene {
  brand: "DIEWISH";
  heading: string;
  periodLabel: string;
  comparisonLabel: string | null;
  kind: HistorySharePayload["kind"];
  scope: HistorySharePayload["scope"];
  cards: readonly HistoryShareVisualCard[];
  details: readonly HistoryShareSceneDetail[];
  aiInsight: string | null;
  motivation: string;
  footer: string;
  density: HistoryShareSceneDensity;
  normalColumns: 1 | 2;
  cardRows: number;
  ariaLabel: string;
}

function visualText(value: string, maxCharacters: number): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  const characters = Array.from(normalized);
  if (characters.length <= maxCharacters) return normalized;

  const sliced = characters.slice(0, Math.max(1, maxCharacters - 1)).join("");
  const lastBreak = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf("\n"));
  const safe = lastBreak >= Math.floor(maxCharacters * 0.72) ? sliced.slice(0, lastBreak) : sliced;
  return `${safe.trimEnd()}…`;
}

function dailyDetails(payload: HistorySharePayload): HistoryShareSceneDetail[] {
  if (payload.kind !== "normal" || payload.scope !== "DAY") return [];

  const details: HistoryShareSceneDetail[] = [];
  for (const section of payload.sections) {
    const lines = section.lines.filter((line) => {
      if (section.title === "Beslenme") {
        return !line.startsWith("Kalori:") && !line.startsWith("Protein:");
      }
      if (section.title === "Hareket") {
        return !line.startsWith("Hareket:");
      }
      return false;
    });
    if (lines.length > 0) {
      details.push(
        Object.freeze({
          title: section.title === "Hareket" ? "Hareket Detayı" : "Beslenme Detayı",
          lines: Object.freeze(lines.map((line) => visualText(line, 420))),
        }),
      );
    }
  }
  return details.slice(0, 2);
}

function densityFor(
  cardCount: number,
  detailCount: number,
  aiLength: number,
  comparison: boolean,
): HistoryShareSceneDensity {
  const contentUnits =
    cardCount +
    detailCount * 1.15 +
    (aiLength > 0 ? 1.35 + Math.min(aiLength / 420, 1.4) : 0) +
    (comparison ? 0.8 : 0);

  if (contentUnits <= 4.8) return "sparse";
  if (contentUnits <= 7.2) return "balanced";
  return "dense";
}

export function buildHistoryShareScene(payload: HistorySharePayload): HistoryShareScene {
  const details = dailyDetails(payload);
  const density = densityFor(
    payload.visualCards.length,
    details.length,
    payload.aiInsight?.length ?? 0,
    payload.kind === "comparison",
  );
  const aiLimit = density === "sparse" ? 700 : density === "balanced" ? 500 : 340;
  const cards = Object.freeze(
    payload.visualCards.map((card) => Object.freeze({ ...card })),
  ) as readonly HistoryShareVisualCard[];
  const normalColumns: 1 | 2 = payload.kind === "normal" && cards.length === 1 ? 1 : 2;
  const cardRows =
    payload.kind === "comparison"
      ? cards.length
      : Math.max(1, Math.ceil(cards.length / normalColumns));
  const heading = payload.title.replace(/^Diewish\s*•\s*/i, "").trim();

  return Object.freeze({
    brand: "DIEWISH",
    heading,
    periodLabel: payload.periodLabel,
    comparisonLabel: payload.comparisonLabel,
    kind: payload.kind,
    scope: payload.scope,
    cards,
    details: Object.freeze(details),
    aiInsight: payload.aiInsight ? visualText(payload.aiInsight, aiLimit) : null,
    motivation: visualText(payload.motivation, HISTORY_MOTIVATION_MAX_CHARACTERS),
    footer: payload.footer,
    density,
    normalColumns,
    cardRows,
    ariaLabel: `Diewish paylaşım görseli önizlemesi: ${heading}, ${payload.periodLabel}`,
  });
}

export interface DistributedVerticalSpace {
  before: number;
  between: number;
  after: number;
}

/**
 * Uses all remaining vertical space symmetrically instead of leaving a large
 * unused region below sparse content.
 */
export function distributeVerticalSpace(
  availableHeight: number,
  blockHeights: readonly number[],
  minimumGap = 18,
): DistributedVerticalSpace {
  if (blockHeights.length === 0) {
    const half = Math.max(0, availableHeight / 2);
    return { before: half, between: 0, after: half };
  }

  const contentHeight = blockHeights.reduce((sum, height) => sum + Math.max(0, height), 0);
  const slots = blockHeights.length + 1;
  const free = Math.max(0, availableHeight - contentHeight);
  const distributed = Math.max(minimumGap, free / slots);
  const required = contentHeight + distributed * slots;

  if (required <= availableHeight) {
    return { before: distributed, between: distributed, after: distributed };
  }

  const fallback = Math.max(0, free / slots);
  return { before: fallback, between: fallback, after: fallback };
}
