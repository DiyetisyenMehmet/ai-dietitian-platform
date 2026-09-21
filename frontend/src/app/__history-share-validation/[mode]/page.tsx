"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import type {
  HistoryShareOptions,
  HistorySharePayload,
  HistoryShareVisualCard,
  HistoryShareVisualTone,
} from "@/application/history/history-share";
import { HistoryShareDialog } from "@/presentation/components/history/history-share-dialog";

type ValidationMode =
  | "daily"
  | "weekly"
  | "monthly"
  | "weekly-comparison"
  | "monthly-comparison";

function summaryCard(
  title: string,
  tone: HistoryShareVisualTone,
  value: string,
  description?: string,
): HistoryShareVisualCard {
  return { title, tone, layout: "summary", value, description };
}

function comparisonCard(
  title: string,
  tone: HistoryShareVisualTone,
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

function buildValidationPayload(
  mode: ValidationMode,
  options: HistoryShareOptions,
): HistorySharePayload {
  const comparison = mode === "weekly-comparison" || mode === "monthly-comparison";
  const week = mode === "weekly" || mode === "weekly-comparison";
  const month = mode === "monthly" || mode === "monthly-comparison";
  const scope: HistorySharePayload["scope"] = mode === "daily" ? "DAY" : week ? "WEEK" : "MONTH";
  const currentLabel = week ? "Bu hafta" : "Bu ay";
  const previousLabel = week ? "Geçen hafta" : "Geçen ay";
  const visualCards: HistoryShareVisualCard[] = [];
  const sections: HistorySharePayload["sections"] = [];

  const addSummary = (
    title: string,
    tone: HistoryShareVisualTone,
    value: string,
    description: string,
    section: string,
    line: string,
  ) => {
    visualCards.push(summaryCard(title, tone, value, description));
    const existing = sections.find((item) => item.title === section);
    if (existing) existing.lines.push(line);
    else sections.push({ title: section, lines: [line] });
  };

  const addComparison = (
    title: string,
    tone: HistoryShareVisualTone,
    currentValue: string,
    previousValue: string,
    difference: string,
  ) => {
    visualCards.push(
      comparisonCard(
        title,
        tone,
        currentLabel,
        previousLabel,
        currentValue,
        previousValue,
        difference,
      ),
    );
    sections.push({
      title,
      lines: [
        `${currentLabel}: ${currentValue}`,
        `${previousLabel}: ${previousValue}`,
        `Fark: ${difference}`,
      ],
    });
  };

  if (options.includeNutrition) {
    if (comparison) {
      addComparison("Ortalama Kalori", "nutrition", "1.840 kcal", "1.760 kcal", "+80 kcal");
      addComparison("Ortalama Protein", "protein", "112 g", "104 g", "+8 g");
    } else {
      addSummary(
        mode === "daily" ? "Toplam Kalori" : "Ortalama Kalori",
        "nutrition",
        mode === "daily" ? "1.840 kcal" : "1.795 kcal",
        "Kaydedilmiş beslenme verileri.",
        "Beslenme",
        "Kalori: 1.840 kcal",
      );
      addSummary(
        mode === "daily" ? "Protein" : "Ortalama Protein",
        "protein",
        "112 g",
        "Protein kaydı.",
        "Beslenme",
        "Protein: 112 g",
      );
      if (options.includeMealNames && mode === "daily") {
        sections
          .find((item) => item.title === "Beslenme")
          ?.lines.push(
            "Öğünler: Zeytinyağlı sebze, yoğurt ve tam tahıllı ekmek ile hazırlanan uzun Türkçe öğle öğünü",
          );
      }
    }
  }

  if (options.includeWater) {
    if (comparison) addComparison("Su", "water", "2,1 L", "1,9 L", "+200 ml");
    else
      addSummary(
        mode === "daily" ? "Su" : "Ortalama Su",
        "water",
        "2,1 L",
        "Kaydedilmiş su tüketimi.",
        "Su",
        "Kaydedilen su: 2,1 L",
      );
  }

  if (options.includeActivity) {
    if (comparison) {
      addComparison(
        "Toplam Aktivite Süresi",
        "activity",
        "5 sa 30 dk",
        "4 sa 20 dk",
        "+1 sa 10 dk",
      );
    } else {
      addSummary(
        "Toplam Aktivite Süresi",
        "activity",
        mode === "daily" ? "55 dk" : "5 sa 30 dk",
        "Yürüyüş ve günlük hareket.",
        "Hareket",
        mode === "daily" ? "Hareket: 55 dk" : "Hareket: 5 sa 30 dk",
      );
      if (mode === "daily") {
        sections.find((item) => item.title === "Hareket")?.lines.push("Mesafe: 4,8 km");
        sections.find((item) => item.title === "Hareket")?.lines.push("Aktivite kaydı: 3");
      }
    }
  }

  if (options.includeSleep) {
    if (comparison)
      addComparison("Ortalama Uyku Süresi", "sleep", "7 sa 32 dk", "7 sa 5 dk", "+27 dk");
    else
      addSummary(
        "Uyku",
        "sleep",
        "7 sa 32 dk",
        "Kaydedilmiş uyku süresi.",
        "Uyku",
        "Uyku: 7 sa 32 dk",
      );
  }

  if (options.includeWeight) {
    if (comparison)
      addComparison("Kilo Değişimi", "weight", "−0,4 kg", "−0,2 kg", "−0,2 kg");
    else
      addSummary(
        mode === "daily" ? "Kilo" : "Kilo Değişimi",
        "weight",
        mode === "daily" ? "70,2 kg" : "−0,4 kg",
        "Kaydedilmiş ölçüm.",
        "Kilo",
        mode === "daily" ? "70,2 kg" : "Kilo değişimi: −0,4 kg",
      );
  }

  const title =
    mode === "daily"
      ? "Diewish • Günün Özeti"
      : mode === "weekly"
        ? "Diewish • Haftanın Özeti"
        : mode === "monthly"
          ? "Diewish • Ayın Özeti"
          : mode === "weekly-comparison"
            ? "Diewish • Haftalık Karşılaştırma"
            : "Diewish • Aylık Karşılaştırma";

  return Object.freeze({
    kind: comparison ? "comparison" : "normal",
    scope,
    title,
    periodLabel:
      mode === "daily"
        ? "21 Eylül 2026"
        : month
          ? "1 Eylül 2026 – 21 Eylül 2026"
          : "14 Eylül 2026 – 20 Eylül 2026",
    comparisonLabel: comparison
      ? week
        ? "Bu hafta ↔ Geçen haftanın aynı dönemi"
        : "Bu ay ↔ Geçen ayın aynı dönemi"
      : null,
    visualCards,
    sections,
    aiInsight: options.includeAiInsight
      ? "Bugünkü kayıtlarına göre öğün, su ve hareket verilerin birlikte değerlendirildiğinde düzenli bir kayıt akışı görülüyor. Öğle öğünündeki protein kaydı ile günlük su tüketimin görünür durumda; değerlendirme yalnızca kaydettiğin verilere dayanır."
      : null,
    footer: "Diewish • Yalnız seçtiğin kayıtlar paylaşılır",
  });
}

export default function HistoryShareValidationPage() {
  const params = useParams<{ mode: string }>();
  const rawMode = params?.mode;
  const mode: ValidationMode =
    rawMode === "weekly" ||
    rawMode === "monthly" ||
    rawMode === "weekly-comparison" ||
    rawMode === "monthly-comparison"
      ? rawMode
      : "daily";

  const buildPayload = React.useCallback(
    (options: HistoryShareOptions) => buildValidationPayload(mode, options),
    [mode],
  );

  return <HistoryShareDialog open onClose={() => undefined} buildPayload={buildPayload} />;
}
