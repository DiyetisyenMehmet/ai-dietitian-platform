/**
 * Health domain types for the AI Health Coach experience (Sprint 17).
 *
 * These types model the mature "health coach" surfaces — health profile, weight
 * tracking, health journey timeline, daily tasks and proactive coaching. They
 * are intentionally decoupled from the presentation layer and shaped so the
 * in-memory stores can later be swapped for a real backend data source without
 * touching components.
 */

import type {
  ActivityLevel,
  DietaryPreference,
  Gender,
} from "@/domain/onboarding/types";

/** A single recorded weight measurement. */
export interface WeightEntry {
  id: string;
  /** ISO date (YYYY-MM-DD) the measurement belongs to. */
  date: string;
  weightKg: number;
  note?: string;
}

/** Processing state of an uploaded blood test. */
export type BloodTestStatus = "analyzing" | "analyzed";

/** A summarized blood test the user has uploaded. */
export interface BloodTestSummary {
  id: string;
  /** ISO date the test was uploaded/taken. */
  date: string;
  title: string;
  /** Short, human-readable AI summary line. */
  summary: string;
  /** Count of flagged (out-of-range) markers, if any. */
  flaggedCount: number;
  /** Analysis pipeline status. */
  status: BloodTestStatus;
  /** Original uploaded file name, when known. */
  fileName?: string;
}

/** An earned achievement / milestone badge. */
export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Icon key resolved by the presentation layer. */
  icon: HealthIconKey;
  /** ISO date the achievement was unlocked, or null if still locked. */
  unlockedAt: string | null;
}

/** The user's complete health profile. */
export interface HealthProfile {
  fullName: string;
  age: number;
  gender: Gender;
  heightCm: number;
  startWeightKg: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  dietaryPreference: DietaryPreference;
  /** Chronic conditions / diseases (free-form, seeded from presets). */
  healthConditions: string[];
  /** Food allergies (free-form, seeded from presets). */
  allergies: string[];
  dailyCalorieGoal: number;
  dailyWaterGoalMl: number;
  /** ISO date the account/profile was created. */
  memberSince: string;
}

/** Kinds of health-journey timeline events. */
export type JourneyEventType =
  | "profile-created"
  | "blood-test"
  | "first-plan"
  | "weight-updated"
  | "goal-reached"
  | "streak";

/** A single event on the user's health-journey timeline. */
export interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  /** ISO date the event occurred. */
  date: string;
  title: string;
  description?: string;
}

/** Categories of daily tasks the coach generates. */
export type DailyTaskKind =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "water"
  | "chat"
  | "weight"
  | "plan";

/** A single dynamically-generated task for today. */
export interface DailyTask {
  id: string;
  kind: DailyTaskKind;
  label: string;
  done: boolean;
  icon: HealthIconKey;
  /** Optional route the task deep-links to. */
  href?: string;
}

/** Tone of a proactive coach insight — drives its visual treatment. */
export type CoachTone = "info" | "success" | "warning" | "nudge";

/** A proactive message from the AI Health Coach shown as a dashboard card. */
export interface CoachInsight {
  id: string;
  tone: CoachTone;
  title: string;
  message: string;
  icon: HealthIconKey;
  /** Optional call-to-action. */
  actionLabel?: string;
  actionHref?: string;
}

/** Severity of a food/nutrition warning. */
export type WarningSeverity = "danger" | "caution";

/**
 * A health warning raised when a logged food conflicts with the user's
 * conditions or allergies. Guidance only — never a medical diagnosis.
 */
export interface FoodWarning {
  id: string;
  severity: WarningSeverity;
  /** The condition or allergy that triggered the warning. */
  trigger: string;
  message: string;
}

/** Icon keys used across health surfaces (resolved to lucide icons in UI). */
export type HealthIconKey =
  | "user"
  | "target"
  | "scale"
  | "droplet"
  | "utensils"
  | "sparkles"
  | "flame"
  | "flag"
  | "trophy"
  | "flask"
  | "heart"
  | "activity"
  | "check"
  | "sunrise"
  | "sun"
  | "moon"
  | "message";
