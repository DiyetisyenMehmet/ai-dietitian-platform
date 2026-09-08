import type { NutrientValues } from "./nutrition-data.types";

export type NutritionAttentionCode =
  | "HIGH_SUGARS"
  | "HIGH_SATURATED_FAT"
  | "HIGH_SALT"
  | "HIGH_ENERGY_DENSITY"
  | "PORTION_HIGH_SODIUM"
  | "PORTION_HIGH_SUGARS";

export interface NutritionAttentionFlag {
  code: NutritionAttentionCode;
  severity: "INFO" | "WATCH";
  basis: "PER_100_G" | "PORTION";
  message: string;
}

/**
 * Product-density rules are deterministic and intentionally conservative.
 * They are screening labels, not medical diagnoses. Missing nutrient values
 * never become inferred/zero values and therefore never produce a flag.
 */
export function derivePer100gAttentionFlags(nutrients: NutrientValues): NutritionAttentionFlag[] {
  const flags: NutritionAttentionFlag[] = [];
  if (nutrients.sugarsG !== null && nutrients.sugarsG > 22.5) {
    flags.push({ code: "HIGH_SUGARS", severity: "WATCH", basis: "PER_100_G", message: "100 g için şeker miktarı yüksek." });
  }
  if (nutrients.saturatedFatG !== null && nutrients.saturatedFatG > 5) {
    flags.push({ code: "HIGH_SATURATED_FAT", severity: "WATCH", basis: "PER_100_G", message: "100 g için doymuş yağ miktarı yüksek." });
  }
  if (nutrients.saltG !== null && nutrients.saltG > 1.5) {
    flags.push({ code: "HIGH_SALT", severity: "WATCH", basis: "PER_100_G", message: "100 g için tuz miktarı yüksek." });
  }
  if (nutrients.energyKcal !== null && nutrients.energyKcal >= 400) {
    flags.push({ code: "HIGH_ENERGY_DENSITY", severity: "INFO", basis: "PER_100_G", message: "Ürünün enerji yoğunluğu yüksek; porsiyon miktarı önemlidir." });
  }
  return flags;
}

/** Portion-level rules are used for mixed/photo meals where no true per-100 g basis exists. */
export function derivePortionAttentionFlags(nutrients: NutrientValues): NutritionAttentionFlag[] {
  const flags: NutritionAttentionFlag[] = [];
  if (nutrients.sodiumMg !== null && nutrients.sodiumMg >= 600) {
    flags.push({ code: "PORTION_HIGH_SODIUM", severity: "WATCH", basis: "PORTION", message: "Bu porsiyonda sodyum miktarı dikkat gerektirecek düzeyde." });
  }
  if (nutrients.sugarsG !== null && nutrients.sugarsG >= 25) {
    flags.push({ code: "PORTION_HIGH_SUGARS", severity: "WATCH", basis: "PORTION", message: "Bu porsiyonda şeker miktarı yüksek olabilir." });
  }
  return flags;
}
