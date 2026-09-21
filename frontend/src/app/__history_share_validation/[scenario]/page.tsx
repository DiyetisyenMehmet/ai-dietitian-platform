"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import type {
  HistoryShareOptions,
  HistorySharePayload,
  HistoryShareVisualCard,
} from "@/application/history/history-share";
import { HistoryShareDialog } from "@/presentation/components/history/history-share-dialog";

type Scenario = "daily" | "weekly" | "monthly" | "weekly-comparison" | "monthly-comparison";

function summaryCard(
  title: string,
  value: string,
  tone: HistoryShareVisualCard["tone"],
  description?: string,
): HistoryShareVisualCard {
  return { title, value, tone, layout: "summary", description };
}

function comparisonCard(
  title: string,
  tone: HistoryShareVisualCard["tone"],
  currentLabel: string,
  previousLabel: string,
  currentValue: string,
  previousValue: string,
  difference: string,
): HistoryShareVisualCard {
  return {
    title,
    tone,
    layout: "comparison",
    currentLabel,
    previousLabel,
    currentValue,
    previousValue,
    difference,
    coverage: "5/7 gün kayıt",
  };
}

function payloadFor(scenario: Scenario, options: HistoryShareOptions): HistorySharePayload {
  const comparison = scenario.endsWith("comparison");
  const weekly = scenario.startsWith("weekly");
  const scope: HistorySharePayload["scope"] =
    scenario === "daily" ? "DAY" : weekly ? "WEEK" : "MONTH";
  const currentLabel = weekly ? "Bu hafta" : "Bu ay";
  const previousLabel = weekly ? "Geçen hafta" : "Geçen ay";
  const cards: HistoryShareVisualCard[] = [];
  const sections: HistorySharePayload["sections"] = [];

  if (options.includeNutrition) {
    if (comparison) {
      cards.push(
        comparisonCard(
          "Ortalama Kalori",
          "nutrition",
          currentLabel,
          previousLabel,
          "1.840 kcal",
          "1.720 kcal",
          "+120 kcal",
        ),
        comparisonCard(
          "Ortalama Protein",
          "protein",
          currentLabel,
          previousLabel,
          "112 g",
          "101 g",
          "+11 g",
        ),
      );
    } else {
      cards.push(
        summaryCard(
          scope === "DAY" ? "Toplam Kalori" : "Ortalama Kalori",
          "1.840 kcal",
          "nutrition",
          scope === "DAY" ? undefined : "Besin değeri bulunan günlerin ortalaması.",
        ),
        summaryCard(
          scope === "DAY" ? "Protein" : "Ortalama Protein",
          "112 g",
          "protein",
          scope === "DAY" ? undefined : "Besin değeri bulunan günlerin ortalaması.",
        ),
      );
    }
    const nutritionLines = ["Kalori: 1.840 kcal", "Protein: 112 g"];
    if (options.includeMealNames && scope === "DAY") {
      nutritionLines.push(
        "Öğünler: Zeytinyağlı sebzeli bulgur pilavı ve yoğurt ile hazırlanmış uzun Türkçe öğün adı",
      );
    }
    sections.push({ title: "Beslenme", lines: nutritionLines });
  }

  if (options.includeWater) {
    cards.push(
      comparison
        ? comparisonCard("Su", "water", currentLabel, previousLabel, "2,1 L", "1,8 L", "+0,3 L")
        : summaryCard("Su", "2,1 L", "water"),
    );
    sections.push({ title: "Su", lines: ["Kaydedilen su: 2,1 L"] });
  }

  if (options.includeActivity) {
    cards.push(
      comparison
        ? comparisonCard(
            "Toplam Aktivite Süresi",
            "activity",
            currentLabel,
            previousLabel,
            "5 sa 30 dk",
            "4 sa 10 dk",
            "+1 sa 20 dk",
          )
        : summaryCard("Toplam Hareket Süresi", "5 sa 30 dk", "activity"),
    );
    sections.push({ title: "Hareket", lines: ["Hareket: 5 sa 30 dk", "Mesafe: 18,4 km"] });
  }

  if (options.includeSleep) {
    cards.push(
      comparison
        ? comparisonCard(
            "Ortalama Uyku Süresi",
            "sleep",
            currentLabel,
            previousLabel,
            "7 sa 28 dk",
            "7 sa 5 dk",
            "+23 dk",
          )
        : summaryCard("Uyku", "7 sa 28 dk", "sleep"),
    );
    sections.push({ title: "Uyku", lines: ["Uyku: 7 sa 28 dk"] });
  }

  if (options.includeWeight) {
    cards.push(
      comparison
        ? comparisonCard(
            "Kilo Değişimi",
            "weight",
            currentLabel,
            previousLabel,
            "−0,4 kg",
            "−0,2 kg",
            "−0,2 kg",
          )
        : summaryCard("Kilo", "72,4 kg", "weight"),
    );
    sections.push({ title: "Kilo", lines: ["72,4 kg"] });
  }

  const title =
    scenario === "daily"
      ? "Diewish • Günün Özeti"
      : scenario === "weekly"
        ? "Diewish • Haftanın Özeti"
        : scenario === "monthly"
          ? "Diewish • Ayın Özeti"
          : scenario === "weekly-comparison"
            ? "Diewish • Haftalık Karşılaştırma"
            : "Diewish • Aylık Karşılaştırma";

  return {
    kind: comparison ? "comparison" : "normal",
    scope,
    title,
    periodLabel:
      scope === "DAY"
        ? "21 Eylül 2026"
        : scope === "WEEK"
          ? "14 Eylül 2026 – 20 Eylül 2026"
          : "1 Eylül 2026 – 21 Eylül 2026",
    comparisonLabel: comparison
      ? weekly
        ? "Bu hafta ↔ Geçen haftanın aynı dönemi"
        : "Bu ay ↔ Geçen ayın aynı dönemi"
      : null,
    visualCards: cards,
    sections,
    aiInsight: options.includeAiInsight
      ? 'İyi öğün ve ölçüm kayıtların var. <script>window.__HISTORY_XSS__=1</script> <img onerror="window.__HISTORY_XSS__=2"> Uzun Türkçe değerlendirme metni; sağlık, yağ, karşılaştırma ve İstanbul sözcükleri doğru görünmeli. '.repeat(
          4,
        )
      : null,
    footer: "Diewish • Yalnız seçtiğin kayıtlar paylaşılır",
  };
}

export default function HistoryShareValidationPage() {
  const params = useParams<{ scenario: string }>();
  const scenario = (
    ["daily", "weekly", "monthly", "weekly-comparison", "monthly-comparison"].includes(
      params.scenario,
    )
      ? params.scenario
      : "daily"
  ) as Scenario;

  const buildPayload = React.useCallback(
    (options: HistoryShareOptions) => payloadFor(scenario, options),
    [scenario],
  );

  return (
    <main className="min-h-screen bg-muted/20">
      <HistoryShareDialog open onClose={() => undefined} buildPayload={buildPayload} />
    </main>
  );
}
