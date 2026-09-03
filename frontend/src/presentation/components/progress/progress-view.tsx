"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { SectionCard } from "@/presentation/components/health/section-card";
import { ProgressStatsSection } from "@/presentation/components/progress/progress-stats-section";
import { WeightChart } from "@/presentation/components/health/weight-chart";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useWeightEntries, weightStore, analyzeWeight } from "@/application/health/weight-store";
import { useActivity } from "@/application/health/activity-store";
import { journeyStore, useJourneyEvents } from "@/application/health/journey-store";
import type { JourneyEventType, WeightEntry } from "@/domain/health/types";

const STATUS_TONE: Record<
  ReturnType<typeof analyzeWeight>["status"],
  { wrap: string; badge: string; label: string }
> = {
  reached: {
    wrap: "border-emerald-500/30 bg-emerald-500/5",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    label: "Hedefe ulaşıldı",
  },
  ahead: {
    wrap: "border-emerald-500/30 bg-emerald-500/5",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    label: "Planın önünde",
  },
  "on-track": {
    wrap: "border-primary/30 bg-primary/5",
    badge: "bg-primary/15 text-primary",
    label: "Yolunda",
  },
  behind: {
    wrap: "border-amber-500/30 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "Takip gerekiyor",
  },
  "no-data": {
    wrap: "border-border bg-muted/40",
    badge: "bg-muted text-muted-foreground",
    label: "Veri bekleniyor",
  },
};

const HISTORY_ICON: Record<JourneyEventType, Parameters<typeof healthIcon>[0]> = {
  "profile-created": "user",
  "blood-test": "flask",
  "first-plan": "sparkles",
  "weight-updated": "scale",
  "goal-reached": "trophy",
  streak: "flame",
  "goal-updated": "flag",
  "meal-added": "utensils",
  "nutrition-adapted": "sparkles",
  review: "calendar",
  achievement: "star",
};

function WeighInForm() {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const kg = Number(value.replace(",", "."));
    if (!Number.isFinite(kg) || kg <= 0 || kg > 400) {
      toast.error("Geçerli bir kilo gir", { description: "Örn. 78.4" });
      return;
    }

    const rounded = Number(kg.toFixed(1));
    setSaving(true);
    try {
      await weightStore.add(rounded);
      await journeyStore.hydrateJourneyFromBackend();
      toast.success("Kilon kaydedildi", {
        description: `${rounded.toLocaleString("tr-TR")} kg`,
      });
      setValue("");
    } catch {
      toast.error("Kilo kaydedilemedi", {
        description: "Bağlantını kontrol edip tekrar deneyebilirsin.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-3">
      <div className="flex-1">
        <label htmlFor="weigh-in" className="mb-1.5 block text-xs text-muted-foreground">
          Bugünkü kilon (kg)
        </label>
        <Input
          id="weigh-in"
          inputMode="decimal"
          placeholder="78.4"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={saving}
        />
      </div>
      <Button type="submit" disabled={saving}>
        <Plus className="size-4" aria-hidden="true" />
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}

/**
 * Progress has one job: show how the user's recorded data changes over time.
 * The former independent demo "Goals" system is intentionally absent; weight
 * target comes from the real profile, activity from real tracking, and events
 * from persisted history so the user does not have to learn overlapping Goal /
 * Journey / Progress concepts.
 */
export function ProgressView() {
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const activity = useActivity();
  const history = useJourneyEvents();

  const analysis = React.useMemo(
    () => analyzeWeight(entries, profile.targetWeightKg),
    [entries, profile.targetWeightKg],
  );
  const tone = STATUS_TONE[analysis.status];
  const latest: WeightEntry | undefined = entries.at(-1);

  return (
    <div className="space-y-5">
      <SectionCard icon="scale" title="Kilo İlerlemen">
        {entries.length === 0 ? (
          <EmptyState
            icon={healthIcon("scale")}
            title="Henüz kilo kaydın yok"
            description="İlk kilonu kaydet; grafiğin ve profilindeki hedef kilo burada görünsün."
          />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold">{analysis.startKg?.toFixed(1)}</p>
                <p className="text-[11px] text-muted-foreground">Başlangıç</p>
              </div>
              <div>
                <p className="text-lg font-bold text-primary">{latest?.weightKg.toFixed(1)}</p>
                <p className="text-[11px] text-muted-foreground">Güncel</p>
              </div>
              <div>
                <p className="text-lg font-bold">
                  {analysis.targetKg > 0 ? analysis.targetKg.toFixed(1) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">Hedef</p>
              </div>
            </div>
            <WeightChart
              entries={entries}
              targetKg={profile.targetWeightKg}
              className="h-44 w-full"
            />
          </>
        )}
      </SectionCard>

      {analysis.status !== "no-data" && (
        <section className={cn("rounded-2xl border p-5 shadow-card", tone.wrap)}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-background/70 text-primary">
              {React.createElement(healthIcon("sparkles"), {
                className: "size-[18px]",
                "aria-hidden": true,
              })}
            </span>
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold">İlerleme Analizi</h3>
              <span
                className={cn(
                  "mt-0.5 inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium",
                  tone.badge,
                )}
              >
                {tone.label}
              </span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{analysis.message}</p>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Hedef kiloya ilerleme</span>
              <span className="font-semibold">%{analysis.progressPercent}</span>
            </div>
            <ProgressBar value={analysis.progressPercent} />
          </div>
        </section>
      )}

      <ProgressStatsSection />

      <SectionCard icon="scale" title="Kilonu Kaydet">
        <WeighInForm />
        {analysis.isWeighInDue && analysis.status !== "no-data" && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Son ölçümünün üzerinden bir hafta geçti. İstersen güncel kilonu ekleyebilirsin.
          </p>
        )}
      </SectionCard>

      <SectionCard icon="activity" title="Aktivite">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Adım</p>
            <p className="mt-1 text-base font-bold tabular-nums">
              {activity.stepGoal > 0 ? activity.steps.toLocaleString("tr-TR") : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {activity.stepGoal > 0
                ? `/ ${activity.stepGoal.toLocaleString("tr-TR")} hedef`
                : "Adım kaynağı henüz bağlı değil"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Aktif süre</p>
            <p className="mt-1 text-base font-bold tabular-nums">{activity.activeMinutes} dk</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {activity.activeMinutesGoal > 0
                ? `/ ${activity.activeMinutesGoal} dk hedef`
                : "Bugün kaydedilen süre"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon="calendar" title="Geçmiş">
        {history.length === 0 ? (
          <EmptyState
            icon={healthIcon("calendar")}
            title="Henüz geçmiş kaydın yok"
            description="Kilo, öğün ve diğer ilerleme kayıtların zamanla burada görünecek."
          />
        ) : (
          <ol className="relative space-y-5 pl-8">
            <span
              className="absolute bottom-1.5 left-[13px] top-1.5 w-px bg-border"
              aria-hidden="true"
            />
            {history.map((event) => {
              const Icon = healthIcon(HISTORY_ICON[event.type]);
              return (
                <li key={event.id} className="relative">
                  <span className="absolute -left-8 flex size-7 items-center justify-center rounded-full border border-border bg-card text-primary">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium leading-tight">{event.title}</p>
                  {event.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatLongDate(new Date(event.date))}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
