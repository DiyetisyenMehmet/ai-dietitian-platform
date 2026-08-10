import type { ActivityLevel, DietaryPreference, Gender } from "@/domain/onboarding/types";
import {
  ACTIVITY_LEVEL_OPTIONS,
  DIETARY_PREFERENCE_OPTIONS,
  GENDER_OPTIONS,
} from "@/domain/onboarding/types";

/** Turkish label for a gender enum value. */
export function genderLabel(value: Gender): string {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Turkish label for an activity-level enum value. */
export function activityLabel(value: ActivityLevel): string {
  return ACTIVITY_LEVEL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Turkish label for a dietary-preference enum value. */
export function dietaryLabel(value: DietaryPreference): string {
  return DIETARY_PREFERENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
