"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { SectionCard } from "@/presentation/components/health/section-card";
import { WeightChart } from "@/presentation/components/health/weight-chart";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { useWeightEntries, weightStore, analyzeWeight } from "@/application/health/weight-store";
import { journeyStore, useJourneyEvents } from "@/application/health/journey-store";
import { useGoals } from "@/application/goals/goals-store";
import { computeProgress, computeStatus } from "@/application/goals/goal-insights";
import {
  getGoalTypeMeta,
  GOAL_STATUS_LABEL,
  type GoalStatus,
} from "@/domain/goals/types";
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
    label: "Nazik hatırlatma",
  },
  "no-data": {
    wrap: "border-border bg-muted/40",
    badge: "bg-muted text-muted-foreground",
    label: "Veri bekleniyor",
  },
};

const GOAL_STATUS_TONE: Record<GoalStatus, string> = {
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ahead: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "on-track": "bg-primary/15 text-primary",
  behind: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

const JOURNEY_ICON: Record<JourneyEventType, Parameters<typeof healthIcon>[0]> = {
  "profile-created": "user",
  "blood-test": "flask",
  "first-plan": "sparkles",
  "weight-updated": "scale",
  "goal-reached": "trophy",
  streak: "flame",
};

function WeighInForm() {
  const [value, setValue] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kg = Number(value.replace(",", "."));
    if (!Number.isFinite(kg) || kg <= 0 || kg > 400) {
      toast.error("Geçerli bir kilo gir", { description: "Örn. 78.4" });
      return;
    }
    const rounded = Number(kg.toFixed(1));
    weightStore.add(rounded);
    journeyStore.add({
      type: "weight-updated",
      title: `Kilo güncellendi: ${rounded.toLocaleString("tr-TR")} kg`,
    });
    toast.success("Kilon kaydedildi", { description: `${rounded.toLocaleString("tr-TR")} kg` });
    setValue("");
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
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit">
        <Plus className="size-4" aria-hidden="true" />
        Kaydet
      </Button>
    </form>
  );
}

/** The Progress screen: weight tracking, AI analysis, journey timeline & goals. */
export function ProgressView() {
  const router = useRouter();
  const profile = useHealthProfile();
  const entries = useWeightEntries();
  const journey = useJourneyEvents();
  const goals = useGoals();

  const analysis = React.useMemo(
    () => analyzeWeight(entries, profile.targetWeightKg),
    [entries, profile.targetWeightKg],
  );
  const tone = STATUS_TONE[analysis.status];
  const latest: WeightEntry | undefined = entries.at(-1);

  return (
    <div className="space-y-5">
      {/* Weight overview */}
      <SectionCard icon="scale" title="Kilo Takibi">
        {entries.length === 0 ? (
          <EmptyState
            icon={healthIcon("scale")}
            title="Henüz kilo kaydın yok"
            description="İlk kilonu kaydet; grafiğin ve hedef çizgin burada belirsin."
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
                <p className="text-lg font-bold">{analysis.targetKg.toFixed(1)}</p>
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

      {/* AI analysis */}
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
              <h3 className="text-sm font-semibold">Koç Analizi</h3>
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
              <span className="text-muted-foreground">Hedefe ilerleme</span>
              <span className="font-semibold">%{analysis.progressPercent}</span>
            </div>
            <ProgressBar value={analysis.progressPercent} />
          </div>
        </section>
      )}

      {/* Weigh-in */}
      <SectionCard icon="scale" title="Kilonu Kaydet">
        <WeighInForm />
        {analysis.isWeighInDue && analysis.status !== "no-data" && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Bu haftaki tartılman gecikti — güncel kilonu eklemeyi unutma.
          </p>
        )}
      </SectionCard>

      {/* Health journey */}
      <SectionCard icon="flag" title="Sağlık Yolculuğun">
        {journey.length === 0 ? (
          <EmptyState
            icon={healthIcon("flag")}
            title="Yolculuğun yeni başlıyor"
            description="Kilometre taşların burada bir zaman çizelgesinde görünecek."
          />
        ) : (
          <ol className="relative space-y-5 pl-8">
            <span
              className="absolute left-[13px] top-1.5 bottom-1.5 w-px bg-border"
              aria-hidden="true"
            />
            {journey.map((event) => {
              const Icon = healthIcon(JOURNEY_ICON[event.type]);
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

      {/* Goals summary */}
      <SectionCard
        icon="target"
        title="Hedeflerin"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/goals">
              Tümü
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        {goals.length === 0 ? (
          <EmptyState
            icon={healthIcon("target")}
            title="Henüz hedefin yok"
            description="İlk hedefini oluştur; ilerlemeni burada takip edelim."
            action={{ label: "Hedef Oluştur", onClick: () => router.push("/goals/new") }}
          />
        ) : (
          <ul className="space-y-4">
            {goals.slice(0, 4).map((goal) => {
              const meta = getGoalTypeMeta(goal.type);
              const progress = computeProgress(goal);
              const status = computeStatus(goal);
              return (
                <li key={goal.id}>
                  <Link
                    href={`/goals/${goal.id}`}
                    className="block rounded-xl border border-border bg-background/40 p-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{goal.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          GOAL_STATUS_TONE[status],
                        )}
                      >
                        {GOAL_STATUS_LABEL[status]}
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={progress} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {goal.currentValue.toLocaleString("tr-TR")} /{" "}
                      {goal.targetValue.toLocaleString("tr-TR")} {meta.unit} • %{progress}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
