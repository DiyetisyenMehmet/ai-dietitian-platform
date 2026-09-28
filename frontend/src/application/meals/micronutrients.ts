import type {
  MicronutrientKeyDto,
  MicronutrientValuesDto,
} from "@/infrastructure/nutrition/nutrition-client";

export const MICRONUTRIENT_DISPLAY: Readonly<
  Record<MicronutrientKeyDto, { label: string; unit: "mg" | "µg" }>
> = {
  calcium: { label: "Kalsiyum", unit: "mg" },
  iron: { label: "Demir", unit: "mg" },
  magnesium: { label: "Magnezyum", unit: "mg" },
  phosphorus: { label: "Fosfor", unit: "mg" },
  potassium: { label: "Potasyum", unit: "mg" },
  zinc: { label: "Çinko", unit: "mg" },
  copper: { label: "Bakır", unit: "mg" },
  manganese: { label: "Manganez", unit: "mg" },
  selenium: { label: "Selenyum", unit: "µg" },
  iodine: { label: "İyot", unit: "µg" },
  vitaminA: { label: "Vitamin A", unit: "µg" },
  vitaminC: { label: "Vitamin C", unit: "mg" },
  vitaminD: { label: "Vitamin D", unit: "µg" },
  vitaminE: { label: "Vitamin E", unit: "mg" },
  vitaminK: { label: "Vitamin K", unit: "µg" },
  thiamin: { label: "Vitamin B1", unit: "mg" },
  riboflavin: { label: "Vitamin B2", unit: "mg" },
  niacin: { label: "Vitamin B3", unit: "mg" },
  vitaminB6: { label: "Vitamin B6", unit: "mg" },
  folate: { label: "Folat (B9)", unit: "µg" },
  vitaminB12: { label: "Vitamin B12", unit: "µg" },
};

export function availableMicronutrients(values: MicronutrientValuesDto | null | undefined) {
  if (!values) return [];
  return (Object.keys(MICRONUTRIENT_DISPLAY) as MicronutrientKeyDto[])
    .flatMap((key) => {
      const value = values[key];
      if (typeof value !== "number" || !Number.isFinite(value)) return [];
      const display = MICRONUTRIENT_DISPLAY[key];
      return [{ key, value, ...display }];
    });
}

export function formatMicronutrientAmount(value: number, unit: "mg" | "µg"): string {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs < 1 ? 2 : abs < 100 ? 1 : 0;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits }).format(value)} ${unit}`;
}

export function formatReferencePercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(rounded)}`;
}

export function visualProgressPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function micronutrientAriaText(
  label: string,
  value: number,
  unit: "mg" | "µg",
  referencePercent?: number,
): string {
  const unitText = unit === "mg" ? "miligram" : "mikrogram";
  const amount = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
  if (referencePercent === undefined) return `${label}, ${amount} ${unitText}`;
  const percent = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(referencePercent);
  return `${label}, ${amount} ${unitText}, günlük referansın yüzde ${percent}'si`;
}
