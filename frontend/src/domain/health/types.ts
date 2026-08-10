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
  | "goal-updated"
  | "meal-added"
  | "nutrition-adapted"
  | "review"
  | "achievement"
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
  | "message"
  | "gauge"
  | "shield"
  | "lightbulb"
  | "calendar"
  | "footprints"
  | "trending-up"
  | "star"
  | "crown";

/* -------------------------------------------------------------------------- */
/* Sprint 20 — AI Health Coach Experience & Guided Journey                     */
/* -------------------------------------------------------------------------- */

/** The seven steps of the guided "Today's Journey". */
export type JourneyStepKind =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "water"
  | "weight"
  | "activity"
  | "coach";

/** Lifecycle state of a single journey step. */
export type JourneyStepState = "completed" | "pending" | "recommended" | "skipped";

/** A single step in the guided daily journey. */
export interface JourneyStep {
  kind: JourneyStepKind;
  label: string;
  /** Short supporting hint shown under the label. */
  hint: string;
  state: JourneyStepState;
  icon: HealthIconKey;
  /** Optional deep-link the step navigates to. */
  href?: string;
  /** Optional progress ratio (0..1) for partially-complete steps (e.g. water). */
  progress?: number;
}

/** A single weighted contributor to the overall health score. */
export interface HealthScoreFactor {
  key: string;
  label: string;
  /** Normalized contribution 0..100. */
  value: number;
  /** Relative weight 0..1 (all weights sum to 1). */
  weight: number;
  icon: HealthIconKey;
}

/** Direction of the health-score trend. */
export type ScoreTrend = "up" | "down" | "flat";

/** The dynamic 0–100 health score with its explanation. */
export interface HealthScore {
  /** Overall score 0..100. */
  score: number;
  /** Qualitative band label (Turkish). */
  band: string;
  trend: ScoreTrend;
  /** Signed delta vs. the recent baseline. */
  delta: number;
  /** Plain-language reason for the current score (Turkish). */
  reason: string;
  /** Prioritized, actionable ways to improve (Turkish). */
  improvements: { label: string; href?: string }[];
  /** Per-factor breakdown for the detailed view. */
  factors: HealthScoreFactor[];
}

/** Category of an AI insight surfaced from the Sprint 19 intelligence layer. */
export type AiInsightKind =
  | "weekly-review"
  | "monthly-review"
  | "risk-alert"
  | "nutrition-adaptation"
  | "smart-question"
  | "memory-summary";

/** Severity used by risk-style insights. */
export type AiInsightSeverity = "info" | "success" | "warning" | "danger";

/** A surfaced AI insight card for the insights hub. */
export interface AiInsight {
  id: string;
  kind: AiInsightKind;
  title: string;
  /** Short one-line summary. */
  summary: string;
  /** Longer supporting detail lines. */
  details: string[];
  severity: AiInsightSeverity;
  icon: HealthIconKey;
  /** Whether this insight is gated behind premium. */
  premium?: boolean;
  actionLabel?: string;
  actionHref?: string;
}
