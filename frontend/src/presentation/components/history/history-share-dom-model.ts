import type {
  HistorySharePayload,
  HistoryShareVisualCard,
} from "@/application/history/history-share";

export interface HistoryShareDomModel {
  heading: string;
  cards: HistoryShareVisualCard[];
  mealNames: string[];
  aiInsight: string | null;
  motivation: string;
}

/** Pure privacy boundary: the DOM view can only consume fields already present in the payload. */
export function historyShareDomModel(payload: HistorySharePayload): HistoryShareDomModel {
  const mealNames = payload.sections
    .flatMap((section) => section.lines)
    .filter((line) => line.startsWith("Öğünler:"))
    .flatMap((line) => line.slice("Öğünler:".length).split(","))
    .map((name) => name.trim())
    .filter(Boolean);

  const heading =
    payload.kind === "comparison"
      ? payload.scope === "CUSTOM"
        ? "Özel Karşılaştırma"
        : payload.scope === "WEEK"
          ? "Haftalık Karşılaştırma"
          : "Aylık Karşılaştırma"
      : payload.scope === "DAY"
        ? "Günün Özeti"
        : payload.scope === "WEEK"
          ? "Haftanın Özeti"
          : "Ayın Özeti";

  return Object.freeze({
    heading,
    cards: payload.visualCards,
    mealNames: Object.freeze(mealNames) as unknown as string[],
    aiInsight: payload.aiInsight,
    motivation: payload.motivation,
  });
}
