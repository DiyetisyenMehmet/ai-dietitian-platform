import {
  TrendingDown,
  TrendingUp,
  Scale,
  Flame,
  Beef,
  Droplets,
  Footprints,
  Dumbbell,
  type LucideIcon,
} from "lucide-react";

import type { GoalStatus, GoalType } from "@/domain/goals/types";

/** Icon per goal type. */
export const GOAL_ICON: Record<GoalType, LucideIcon> = {
  "lose-weight": TrendingDown,
  "gain-weight": TrendingUp,
  "maintain-weight": Scale,
  "daily-calories": Flame,
  protein: Beef,
  water: Droplets,
  steps: Footprints,
  exercise: Dumbbell,
};

/** Accent color classes per goal type (icon container). */
export const GOAL_ACCENT: Record<GoalType, string> = {
  "lose-weight": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "gain-weight": "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "maintain-weight": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "daily-calories": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  protein: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  water: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  steps: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  exercise: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

/** Progress-bar fill color per goal type. */
export const GOAL_BAR: Record<GoalType, string> = {
  "lose-weight": "bg-emerald-500",
  "gain-weight": "bg-sky-500",
  "maintain-weight": "bg-violet-500",
  "daily-calories": "bg-orange-500",
  protein: "bg-rose-500",
  water: "bg-cyan-500",
  steps: "bg-amber-500",
  exercise: "bg-indigo-500",
};

/** Badge color classes per status. */
export const STATUS_BADGE: Record<GoalStatus, string> = {
  "on-track": "bg-primary/10 text-primary",
  ahead: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  behind: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-success/10 text-success",
};
