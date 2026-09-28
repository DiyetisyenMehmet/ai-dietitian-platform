import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  availableMicronutrients,
  formatMicronutrientAmount,
  formatReferencePercent,
  micronutrientAriaText,
  visualProgressPercent,
} from "../src/application/meals/micronutrients";

test("missing micronutrient values stay absent while an explicit zero is preserved", () => {
  const rows = availableMicronutrients({
    calcium: null,
    iron: 0,
    vitaminC: 8.4,
  });

  expect(rows.map((row) => row.key)).toEqual(["iron", "vitaminC"]);
  expect(rows[0]?.value).toBe(0);
});

test("Turkish micronutrient formatting is compact and localized", () => {
  expect(formatMicronutrientAmount(620, "mg")).toBe("620 mg");
  expect(formatMicronutrientAmount(8.4, "mg")).toBe("8,4 mg");
  expect(formatMicronutrientAmount(2.1, "µg")).toBe("2,1 µg");
});

test("reference percentages above 100 remain numeric while visual progress stays bounded", () => {
  expect(formatReferencePercent(145)).toBe("%145");
  expect(visualProgressPercent(145)).toBe(100);
  expect(visualProgressPercent(-4)).toBe(0);
  expect(visualProgressPercent(Number.NaN)).toBe(0);
});

test("micronutrient accessibility text carries amount and dietary-reference semantics", () => {
  expect(micronutrientAriaText("Kalsiyum", 620, "mg", 77.5)).toBe(
    "Kalsiyum, 620 miligram, günlük referansın yüzde 77,5'si",
  );
});

test("micronutrient cards remain mobile-first and avoid diagnosis or danger language", () => {
  const root = process.cwd();
  const summary = readFileSync(
    join(root, "src/presentation/components/meals/micronutrient-summary.tsx"),
    "utf8",
  );
  const scan = readFileSync(
    join(root, "src/presentation/components/meals/nutrition-scan-sections.tsx"),
    "utf8",
  );

  expect(summary).toContain("grid-cols-1");
  expect(summary).toContain("sm:grid-cols-2");
  expect(summary).toContain("min-w-0");
  expect(summary).toContain("tıbbi reçete veya laboratuvar tanısı değildir");
  expect(scan).toContain("Yalnız seçilen porsiyon");
  expect(scan).not.toMatch(/tehlikeli|eksikliğiniz var|takviye al/iu);
  expect(summary).not.toMatch(/tehlikeli|eksikliğiniz var|takviye al/iu);
});
