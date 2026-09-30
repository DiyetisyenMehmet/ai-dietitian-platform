import type { AllergenEvidence, CanonicalFood } from "./nutrition-data.types";

export type AllergenSafetyStatus = "KNOWN_SAFE" | "KNOWN_RISK" | "UNKNOWN";

export interface AllergenSafetyAssessment {
  status: AllergenSafetyStatus;
  matchedAllergens: string[];
  crossContaminationMatches: string[];
  dataComplete: boolean;
  message: string | null;
  crossContaminationWarnings: string[];
}

const UNKNOWN_MESSAGE =
  "Alerjen bilgisi yeterli değil. Ambalaj üzerindeki içerik ve alerjen uyarılarını kontrol et.";

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(allergen: string, evidence: string): boolean {
  const a = normalize(allergen);
  const e = normalize(evidence);
  if (!a || !e) return false;
  return ` ${e} `.includes(` ${a} `) || ` ${a} `.includes(` ${e} `);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function matchedAllergens(allergies: string[], evidence: string[]): string[] {
  return unique(allergies.filter((allergen) => evidence.some((value) => matches(allergen, value))));
}

function hasReliableCompleteEvidence(food: CanonicalFood, evidence?: AllergenEvidence): boolean {
  return Boolean(
    evidence?.ingredientList === "DECLARED" &&
      evidence.allergenDeclaration === "DECLARED" &&
      !food.provenance.stale &&
      food.provenance.confidence >= 0.7,
  );
}

/**
 * Central packaged/reference-food allergy safety decision.
 * Missing fields never become a "safe" conclusion.
 */
export function assessFoodAllergenSafety(
  food: CanonicalFood,
  allergies: readonly string[],
): AllergenSafetyAssessment {
  const userAllergies = unique([...allergies]);
  const crossWarnings = unique(food.allergenEvidence?.crossContaminationWarnings ?? []);
  const directEvidence = [
    food.name,
    food.displayNameTr,
    ...food.ingredients,
    ...food.allergens,
  ];
  const directMatches = matchedAllergens(userAllergies, directEvidence);
  const crossMatches = matchedAllergens(userAllergies, crossWarnings);
  const allMatches = unique([...directMatches, ...crossMatches]);
  const dataComplete = hasReliableCompleteEvidence(food, food.allergenEvidence);

  if (allMatches.length > 0) {
    return {
      status: "KNOWN_RISK",
      matchedAllergens: allMatches,
      crossContaminationMatches: crossMatches,
      dataComplete,
      message:
        `Kayıtlı alerjinle eşleşen bilgi bulundu: ${allMatches.join(", ")}. ` +
        "Ürünü tüketmeden önce ambalajdaki içerik ve alerjen uyarılarını kontrol et.",
      crossContaminationWarnings: crossWarnings,
    };
  }

  if (dataComplete) {
    return {
      status: "KNOWN_SAFE",
      matchedAllergens: [],
      crossContaminationMatches: [],
      dataComplete: true,
      message:
        userAllergies.length > 0
          ? "Mevcut kaynak verisinde kayıtlı alerjilerinle eşleşme bulunmadı. Ambalaj üzerindeki uyarılar her zaman önceliklidir."
          : null,
      crossContaminationWarnings: crossWarnings,
    };
  }

  return {
    status: "UNKNOWN",
    matchedAllergens: [],
    crossContaminationMatches: [],
    dataComplete: false,
    message: userAllergies.length > 0 ? UNKNOWN_MESSAGE : null,
    crossContaminationWarnings: crossWarnings,
  };
}

/**
 * Generated plans must provide explicit ingredient composition when the user
 * has allergies. Product/food name alone can prove a risk, but never safety.
 */
export function assessPlannedFoodAllergenSafety(
  food: { name: string; ingredients?: readonly string[] },
  allergies: readonly string[],
): AllergenSafetyAssessment {
  const userAllergies = unique([...allergies]);
  if (userAllergies.length === 0) {
    return {
      status: "KNOWN_SAFE",
      matchedAllergens: [],
      crossContaminationMatches: [],
      dataComplete: true,
      message: null,
      crossContaminationWarnings: [],
    };
  }

  const ingredients = unique([...(food.ingredients ?? [])]);
  const matchesFound = matchedAllergens(userAllergies, [food.name, ...ingredients]);
  if (matchesFound.length > 0) {
    return {
      status: "KNOWN_RISK",
      matchedAllergens: matchesFound,
      crossContaminationMatches: [],
      dataComplete: ingredients.length > 0,
      message: `Kayıtlı alerjinle eşleşen içerik bulundu: ${matchesFound.join(", ")}.`,
      crossContaminationWarnings: [],
    };
  }
  if (ingredients.length === 0) {
    return {
      status: "UNKNOWN",
      matchedAllergens: [],
      crossContaminationMatches: [],
      dataComplete: false,
      message: UNKNOWN_MESSAGE,
      crossContaminationWarnings: [],
    };
  }
  return {
    status: "KNOWN_SAFE",
    matchedAllergens: [],
    crossContaminationMatches: [],
    dataComplete: true,
    message: null,
    crossContaminationWarnings: [],
  };
}

/**
 * A photo estimate cannot establish a complete ingredient/allergen declaration.
 * It can identify an explicit risk, otherwise it remains UNKNOWN.
 */
export function assessPhotoIngredientAllergenSafety(
  ingredients: readonly { name: string; included: boolean }[],
  allergies: readonly string[],
): AllergenSafetyAssessment {
  const userAllergies = unique([...allergies]);
  const visible = ingredients.filter((item) => item.included).map((item) => item.name);
  const matchesFound = matchedAllergens(userAllergies, visible);
  if (matchesFound.length > 0) {
    return {
      status: "KNOWN_RISK",
      matchedAllergens: matchesFound,
      crossContaminationMatches: [],
      dataComplete: false,
      message: `Kayıtlı alerjinle eşleşebilecek içerik tespit edildi: ${matchesFound.join(", ")}. İçerik ve alerjen bilgisini ambalajdan veya güvenilir kaynaktan doğrula.`,
      crossContaminationWarnings: [],
    };
  }
  return {
    status: "UNKNOWN",
    matchedAllergens: [],
    crossContaminationMatches: [],
    dataComplete: false,
    message: userAllergies.length > 0 ? UNKNOWN_MESSAGE : null,
    crossContaminationWarnings: [],
  };
}
