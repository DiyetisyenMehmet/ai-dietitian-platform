import { Coffee, Sun, Moon, Cookie, type LucideIcon } from "lucide-react";

import type { MealSlot } from "@/domain/meals/types";

/** Icon per meal slot. */
export const SLOT_ICON: Record<MealSlot, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

/** Accent color classes per meal slot (icon container). */
export const SLOT_ACCENT: Record<MealSlot, string> = {
  breakfast: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  lunch: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  dinner: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  snack: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};
