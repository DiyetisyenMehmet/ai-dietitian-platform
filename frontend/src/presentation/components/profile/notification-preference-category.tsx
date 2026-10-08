"use client";

import {
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Droplets,
  Moon,
  Sparkles,
  Timer,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import type { NotificationPreferenceMeta, NotificationPreferences } from "@/domain/account/types";
import { waterPlanSummary, waterReminderPlan } from "@/domain/account/water-reminder-plan";
import { Card } from "@/presentation/components/ui/card";

export type ToggleKey = NotificationPreferenceMeta["key"];
type TimeField =
  | "waterReminderTime"
  | "activityReminderTime"
  | "sleepReminderTime"
  | "weeklySummaryTime";

const TIME_FIELDS: Partial<Record<ToggleKey, TimeField>> = {
  waterReminders: "waterReminderTime",
  activityReminders: "activityReminderTime",
  sleepReminders: "sleepReminderTime",
  weeklySummary: "weeklySummaryTime",
};
const ICONS: Partial<Record<ToggleKey, LucideIcon>> = {
  mealReminders: Utensils,
  waterReminders: Droplets,
  activityReminders: Timer,
  sleepReminders: Moon,
  weeklySummary: BarChart3,
  coachTips: Sparkles,
};
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export function notificationPlanSummary(
  key: ToggleKey,
  preferences: NotificationPreferences,
): string {
  if (key === "waterReminders" && preferences.waterReminderSchedule)
    return waterPlanSummary(
      waterReminderPlan(preferences.waterReminderSchedule, preferences.waterReminderTime),
    );
  const timeField = TIME_FIELDS[key];
  if (timeField) {
    const day = key === "weeklySummary" ? DAYS[preferences.weeklySummaryDay] : "Her gün";
    return `${day} · ${preferences[timeField]}`;
  }
  if (key === "mealReminders") return "Öğün planındaki saatlere göre";
  return "Koç önerileri hazır olduğunda";
}

export function CategoryIcon({ category }: { category: ToggleKey }) {
  const Icon = ICONS[category] ?? BellRing;
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${category === "waterReminders" || category === "sleepReminders" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-primary/10 text-primary"}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

export function PreferenceSwitch({
  label,
  enabled,
  busy,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <span
        className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors motion-reduce:transition-none ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span
          className={`flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${enabled ? "translate-x-5" : "translate-x-0"}`}
        >
          {enabled && <Check className="size-3 text-primary" aria-hidden="true" />}
        </span>
      </span>
    </button>
  );
}

interface CategoryProps {
  item: NotificationPreferenceMeta;
  preferences: NotificationPreferences;
  busy: boolean;
  onToggle: () => void;
}

export function NotificationPreferenceCard({
  item,
  preferences,
  busy,
  saving,
  onToggle,
  onOpen,
}: CategoryProps & { saving: boolean; onOpen: () => void }) {
  const summary = notificationPlanSummary(item.key, preferences);
  return (
    <Card data-notification-category={item.key} className="relative p-4">
      <div className="flex items-start gap-3">
        <CategoryIcon category={item.key} />
        <div className="min-w-0 flex-1 pr-14">
          <h2 className="text-sm font-semibold leading-5">{item.label}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
        <div className="absolute right-4 top-3">
          <PreferenceSwitch
            label={item.label}
            enabled={preferences[item.key]}
            busy={busy}
            onToggle={onToggle}
          />
        </div>
      </div>
      <button
        type="button"
        aria-label={`${item.label} detayları`}
        onClick={onOpen}
        className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-5">{summary}</span>
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </button>
      {saving && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Kaydediliyor…
        </p>
      )}
    </Card>
  );
}
