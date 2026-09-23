import { expect, test } from "@playwright/test";

import type { HistorySharePayload } from "../src/application/history/history-share";
import { historyShareDomModel } from "../src/presentation/components/history/history-share-dom-model";

function payload(overrides: Partial<HistorySharePayload> = {}): HistorySharePayload {
  return {
    kind: "normal",
    scope: "DAY",
    title: "Diewish • Günün Özeti",
    periodLabel: "21 Eylül 2026",
    comparisonLabel: null,
    visualCards: [{ title: "Su", tone: "water", layout: "summary", value: "2,1 L" }],
    sections: [{ title: "Su", lines: ["Kaydedilen su: 2,1 L"] }],
    aiInsight: null,
    motivation: "Bugün attığın küçük adımlar ilerlemeni görünür kılıyor.",
    ...overrides,
  };
}

test("only-water selection creates a DOM model containing only water", () => {
  const model = historyShareDomModel(payload());
  expect(model.heading).toBe("Günün Özeti");
  expect(model.cards.map((card) => card.tone)).toEqual(["water"]);
  expect(model.mealNames).toEqual([]);
  expect(model.aiInsight).toBeNull();
  expect(model.motivation).toContain("küçük adımlar");
  expect(JSON.stringify(model)).not.toContain("Toplam Kalori");
  expect(JSON.stringify(model)).not.toContain("Protein");
});

test("default and all-option models render only privacy-filtered optional modules", () => {
  const defaultModel = historyShareDomModel(
    payload({
      visualCards: [
        { title: "Toplam Kalori", tone: "nutrition", layout: "summary", value: "1.840 kcal" },
        { title: "Protein", tone: "protein", layout: "summary", value: "112 g" },
        { title: "Su", tone: "water", layout: "summary", value: "2,1 L" },
        {
          title: "Toplam Hareket Süresi",
          tone: "activity",
          layout: "summary",
          value: "42 dk",
        },
      ],
    }),
  );
  expect(defaultModel.cards.map((card) => card.tone)).toEqual([
    "nutrition",
    "protein",
    "water",
    "activity",
  ]);
  expect(defaultModel.mealNames).toEqual([]);
  expect(defaultModel.aiInsight).toBeNull();

  const allModel = historyShareDomModel(
    payload({
      visualCards: [
        ...defaultModel.cards,
        { title: "Uyku", tone: "sleep", layout: "summary", value: "7 sa 28 dk" },
        { title: "Kilo", tone: "weight", layout: "summary", value: "82 kg" },
      ],
      sections: [{ title: "Beslenme", lines: ["Öğünler: Kahvaltı, Öğle"] }],
      aiInsight: "Bugünkü kayıtların dengeli ilerliyor.",
    }),
  );
  expect(allModel.cards.map((card) => card.tone)).toContain("sleep");
  expect(allModel.cards.map((card) => card.tone)).toContain("weight");
  expect(allModel.mealNames).toEqual(["Kahvaltı", "Öğle"]);
  expect(allModel.aiInsight).toBe("Bugünkü kayıtların dengeli ilerliyor.");
});

test("weekly and monthly normal models stay distinct from comparison models", () => {
  for (const scope of ["WEEK", "MONTH"] as const) {
    const normal = historyShareDomModel(payload({ scope }));
    expect(normal.heading).toBe(scope === "WEEK" ? "Haftanın Özeti" : "Ayın Özeti");

    const comparison = historyShareDomModel(
      payload({
        kind: "comparison",
        scope,
        comparisonLabel:
          scope === "WEEK"
            ? "Bu hafta ↔ Geçen haftanın aynı dönemi"
            : "Bu ay ↔ Geçen ayın aynı dönemi",
        visualCards: [
          {
            title: "Ortalama Kalori",
            tone: "nutrition",
            layout: "comparison",
            currentLabel: scope === "WEEK" ? "Bu hafta" : "Bu ay",
            currentValue: "1.840 kcal",
            previousLabel: scope === "WEEK" ? "Geçen hafta" : "Geçen ay",
            previousValue: "1.740 kcal",
            difference: "+100 kcal",
            coverage: "5/7 gün kayıt",
          },
        ],
      }),
    );
    expect(comparison.heading).toBe(
      scope === "WEEK" ? "Haftalık Karşılaştırma" : "Aylık Karşılaştırma",
    );
    expect(comparison.cards[0]).toMatchObject({
      layout: "comparison",
      currentLabel: scope === "WEEK" ? "Bu hafta" : "Bu ay",
      previousLabel: scope === "WEEK" ? "Geçen hafta" : "Geçen ay",
      difference: "+100 kcal",
    });
  }
});

test("DOM model cannot reintroduce PII absent from the immutable payload", () => {
  const source = payload({ aiInsight: "Güvenli değerlendirme" });
  const model = historyShareDomModel(source);
  const serialized = JSON.stringify(model);
  expect(serialized).not.toContain("fullName");
  expect(serialized).not.toContain("email");
  expect(serialized).not.toContain("phone");
  expect(serialized).not.toContain("internalId");
  expect(Object.isFrozen(model)).toBe(true);
});
