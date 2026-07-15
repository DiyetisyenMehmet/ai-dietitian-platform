/**
 * Onboarding domain types and option metadata. Enum values mirror the backend
 * Prisma enums exactly (sent as-is); the labels are the Turkish UI copy.
 */

export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";
export type DietaryPreference =
  | "OMNIVORE"
  | "VEGETARIAN"
  | "VEGAN"
  | "PESCATARIAN"
  | "KETO"
  | "PALEO"
  | "MEDITERRANEAN"
  | "GLUTEN_FREE"
  | "OTHER";

/** A selectable option with a value, label and optional helper description. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export const GENDER_OPTIONS: readonly SelectOption<Gender>[] = [
  { value: "FEMALE", label: "Kadın" },
  { value: "MALE", label: "Erkek" },
  { value: "OTHER", label: "Diğer" },
  { value: "PREFER_NOT_TO_SAY", label: "Belirtmek istemiyorum" },
] as const;

export const ACTIVITY_LEVEL_OPTIONS: readonly SelectOption<ActivityLevel>[] = [
  { value: "SEDENTARY", label: "Hareketsiz", description: "Masa başı, çok az egzersiz" },
  { value: "LIGHT", label: "Az Aktif", description: "Haftada 1-2 gün hafif egzersiz" },
  { value: "MODERATE", label: "Orta Aktif", description: "Haftada 3-5 gün egzersiz" },
  { value: "ACTIVE", label: "Aktif", description: "Haftada 6-7 gün egzersiz" },
  { value: "VERY_ACTIVE", label: "Çok Aktif", description: "Günde 2 kez veya ağır iş" },
] as const;

export const DIETARY_PREFERENCE_OPTIONS: readonly SelectOption<DietaryPreference>[] = [
  { value: "OMNIVORE", label: "Her şey", description: "Özel bir kısıtlama yok" },
  { value: "VEGETARIAN", label: "Vejetaryen" },
  { value: "VEGAN", label: "Vegan" },
  { value: "PESCATARIAN", label: "Pesketaryen", description: "Balık dahil, et hariç" },
  { value: "KETO", label: "Ketojenik" },
  { value: "PALEO", label: "Paleo" },
  { value: "MEDITERRANEAN", label: "Akdeniz" },
  { value: "GLUTEN_FREE", label: "Glutensiz" },
  { value: "OTHER", label: "Diğer" },
] as const;

/** Common presets offered as quick-select chips (users can also add their own). */
export const HEALTH_CONDITION_PRESETS: readonly string[] = [
  "Diyabet",
  "Hipertansiyon",
  "Yüksek Kolesterol",
  "Tiroid",
  "Çölyak",
  "İnsülin Direnci",
  "PCOS",
  "Kalp Rahatsızlığı",
] as const;

export const ALLERGY_PRESETS: readonly string[] = [
  "Fıstık",
  "Kuruyemiş",
  "Süt / Laktoz",
  "Yumurta",
  "Gluten",
  "Deniz Ürünleri",
  "Soya",
  "Susam",
] as const;

/** Onboarding profile returned by the backend (age is derived server-side). */
export interface OnboardingProfile {
  dateOfBirth: string;
  age: number;
  gender: Gender;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  healthConditions: string[];
  allergies: string[];
  dietaryPreference: DietaryPreference;
  dailyWaterGoalMl: number;
  updatedAt: string;
}
