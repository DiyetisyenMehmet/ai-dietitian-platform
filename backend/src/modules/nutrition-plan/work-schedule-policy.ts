import type { WorkScheduleType } from "./types";

/**
 * VARIABLE_SHIFT users do not have one stable civil-clock routine. A recurring
 * hunger event at 15:00 can represent different biological points across shifts,
 * so wall-clock learning is disabled until the product captures per-day shifts.
 */
export function allowsWallClockHungerAdaptation(
  workScheduleType?: WorkScheduleType | null,
): boolean {
  return workScheduleType !== "VARIABLE_SHIFT";
}

/**
 * Bounded provider context for practical food selection only. Deterministic
 * mealTiming remains authoritative and the provider never chooses clock times.
 */
export function workScheduleBehaviorInsight(
  workScheduleType?: WorkScheduleType | null,
): string | null {
  if (workScheduleType === "VARIABLE_SHIFT") {
    return "Kullanıcının çalışma düzeni değişken/vardiyalı. Sabit duvar saatini kalıcı alışkanlık varsayma; mealTiming saatlerini aynen korurken taşınabilir, önceden hazırlanabilir ve farklı vardiyalarda uygulanabilir öğünler seç.";
  }
  if (workScheduleType === "NIGHT_SHIFT") {
    return "Kullanıcı gece vardiyasında. Öğün içeriğini medeni günün sabah/akşamına göre değil kullanıcının uyanıklık akışına göre düşün; mealTiming saatlerini aynen koru ve gece vardiyasında pratik/taşınabilir seçenekleri önceliklendir.";
  }
  return null;
}
