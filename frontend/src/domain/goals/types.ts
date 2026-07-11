/** The supported goal categories. */
export type GoalType =
  | "lose-weight"
  | "gain-weight"
  | "maintain-weight"
  | "daily-calories"
  | "protein"
  | "water"
  | "steps"
  | "exercise";

/**
 * Progress direction:
 * - "increase": higher current value is better (toward target)
 * - "decrease": lower current value is better (toward target)
 * - "maintain": staying near the target value is best
 */
export type GoalDirection = "increase" | "decrease" | "maintain";

/** Computed lifecycle status of a goal. */
export type GoalStatus = "on-track" | "ahead" | "behind" | "completed";

/** A single point in a goal's progress history. */
export interface GoalHistoryEntry {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  value: number;
  note?: string;
}

/** A user goal with its configuration and progress history. */
export interface Goal {
  id: string;
  type: GoalType;
  /** Custom title; falls back to the type label when empty. */
  title: string;
  /** Baseline value at start (used for decrease/maintain progress math). */
  startValue: number;
  /** Latest recorded value. */
  currentValue: number;
  /** Desired value. */
  targetValue: number;
  /** ISO date (YYYY-MM-DD). */
  startDate: string;
  /** ISO date (YYYY-MM-DD). */
  targetDate: string;
  /** Local reminder time HH:MM (24h), optional. */
  reminderTime?: string;
  notes?: string;
  history: GoalHistoryEntry[];
}

/** Static metadata describing each goal type. */
export interface GoalTypeMeta {
  type: GoalType;
  label: string;
  /** Measurement unit shown next to values. */
  unit: string;
  direction: GoalDirection;
  /** Short helper text shown in the type picker. */
  hint: string;
}

/** Ordered goal-type metadata for consistent rendering across the module. */
export const GOAL_TYPES: readonly GoalTypeMeta[] = [
  {
    type: "lose-weight",
    label: "Kilo Verme",
    unit: "kg",
    direction: "decrease",
    hint: "Hedef kiloya doğru ilerle",
  },
  {
    type: "gain-weight",
    label: "Kilo Alma",
    unit: "kg",
    direction: "increase",
    hint: "Sağlıklı şekilde kilo al",
  },
  {
    type: "maintain-weight",
    label: "Kiloyu Koruma",
    unit: "kg",
    direction: "maintain",
    hint: "Mevcut kilonu koru",
  },
  {
    type: "daily-calories",
    label: "Günlük Kalori",
    unit: "kcal",
    direction: "increase",
    hint: "Günlük kalori hedefin",
  },
  {
    type: "protein",
    label: "Protein",
    unit: "g",
    direction: "increase",
    hint: "Günlük protein alımın",
  },
  { type: "water", label: "Su", unit: "ml", direction: "increase", hint: "Günlük su tüketimin" },
  {
    type: "steps",
    label: "Adım",
    unit: "adım",
    direction: "increase",
    hint: "Günlük adım hedefin",
  },
  {
    type: "exercise",
    label: "Egzersiz",
    unit: "dk",
    direction: "increase",
    hint: "Haftalık egzersiz süren",
  },
] as const;

/** Lookup helper for a goal type's metadata. */
export function getGoalTypeMeta(type: GoalType): GoalTypeMeta {
  return GOAL_TYPES.find((g) => g.type === type) ?? GOAL_TYPES[0];
}

/** Human-readable Turkish labels for each status. */
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  "on-track": "İyi gidiyor",
  ahead: "Hedefin önünde",
  behind: "Geride",
  completed: "Tamamlandı",
};
