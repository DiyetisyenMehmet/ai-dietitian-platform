"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Pencil, Trash2, CalendarClock, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { formatNumber } from "@/shared/lib/format";
import { getGoalTypeMeta } from "@/domain/goals/types";
import { useGoal, goalsStore } from "@/application/goals/goals-store";
import {
  computeProgress,
  computeStatus,
  completionEstimate,
  motivationalInsight,
  computeStatistics,
  weeklySeries,
  daysRemaining,
} from "@/application/goals/goal-insights";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { Button } from "@/presentation/components/ui/button";
import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { Loading } from "@/presentation/components/feedback/loading";
import { ErrorState } from "@/presentation/components/feedback/error-state";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from "@/presentation/components/ui/modal";
import { GOAL_ICON, GOAL_ACCENT, GOAL_BAR } from "./goal-visuals";
import { StatusBadge } from "./status-badge";
import { WeeklyChart } from "./weekly-chart";

/** Formats an ISO date (YYYY-MM-DD) as a short Turkish date, e.g. "9 Tem". */
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(d);
}

/** Formats an ISO date as a full Turkish date, e.g. "9 Temmuz 2026". */
function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

interface GoalDetailsViewProps {
  goalId: string;
}

/** Full goal details screen: progress, chart, insight, timeline and statistics. */
export function GoalDetailsView({ goalId }: GoalDetailsViewProps) {
  const router = useRouter();
  const goal = useGoal(goalId);
  const [loading, setLoading] = React.useState(true);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Brief mount loading for a polished perceived-performance experience.
  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  const handleDelete = React.useCallback(async () => {
    if (!goal) return;
    setDeleting(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    goalsStore.remove(goal.id);
    toast.success("Hedef silindi");
    router.push("/goals");
  }, [goal, router]);

  if (loading) {
    return <Loading label="Hedef yükleniyor..." />;
  }

  if (!goal) {
    return (
      <ErrorState
        title="Hedef bulunamadı"
        message="Aradığın hedef silinmiş veya taşınmış olabilir."
        onRetry={() => router.push("/goals")}
      />
    );
  }

  const meta = getGoalTypeMeta(goal.type);
  const Icon = GOAL_ICON[goal.type];
  const progress = computeProgress(goal);
  const status = computeStatus(goal);
  const stats = computeStatistics(goal);
  const series = weeklySeries(goal);
  const insight = motivationalInsight(goal);
  const estimate = completionEstimate(goal);
  const remainingDays = daysRemaining(goal.targetDate);
  const timeline = [...goal.history].reverse();

  return (
    <div className="animate-fade-in space-y-6 pb-4">
      {/* Header: identity + progress ring */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3.5">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                GOAL_ACCENT[goal.type],
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold">{goal.title}</h1>
                <StatusBadge status={status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{meta.label}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:justify-around">
            <CircularProgress value={progress} size={150} strokeWidth={12}>
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums">%{progress}</p>
                <p className="text-xs text-muted-foreground">tamamlandı</p>
              </div>
            </CircularProgress>

            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-center sm:text-left">
              <div>
                <p className="text-xs text-muted-foreground">Güncel</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatNumber(goal.currentValue)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{meta.unit}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hedef</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatNumber(goal.targetValue)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{meta.unit}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Kalan</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatNumber(stats.remainingValue)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">{meta.unit}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Kalan Süre</p>
                <p className="text-lg font-bold tabular-nums">
                  {remainingDays}{" "}
                  <span className="text-sm font-normal text-muted-foreground">gün</span>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Motivational insight */}
      <section aria-label="Motivasyon">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-soft">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 backdrop-blur">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold">
                Koçundan not
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Motivasyon
                </span>
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{insight}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Weekly progress chart */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Haftalık İlerleme</h2>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              Son 7 gün
            </span>
          </div>
          <WeeklyChart data={series} barClassName={GOAL_BAR[goal.type]} unit={meta.unit} />
        </CardContent>
      </Card>

      {/* Completion estimate */}
      <Card>
        <CardContent className="flex items-center gap-3.5 p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent">
            <CalendarClock className="size-5 text-accent-foreground" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Tahmini Tamamlanma</p>
            <p className="text-sm text-muted-foreground">{estimate}</p>
          </div>
        </CardContent>
      </Card>

      {/* Statistics grid */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">İstatistikler</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="İlerleme" value={`%${stats.progress}`} />
            <StatTile label="En İyi" value={`${formatNumber(stats.bestValue)} ${meta.unit}`} />
            <StatTile label="Ortalama" value={`${formatNumber(stats.averageValue)} ${meta.unit}`} />
            <StatTile label="Kayıt" value={`${stats.entryCount}`} />
          </div>
        </CardContent>
      </Card>

      {/* History timeline */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Geçmiş</h2>
          </div>
          <ol className="relative space-y-4 pl-6">
            <span
              className="absolute left-[7px] top-1 h-[calc(100%-0.5rem)] w-px bg-border"
              aria-hidden="true"
            />
            {timeline.map((entry) => (
              <li key={entry.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[22px] top-1 size-3.5 rounded-full border-2 border-background",
                    GOAL_BAR[goal.type],
                  )}
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatNumber(entry.value)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{meta.unit}</span>
                    </p>
                    {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatShortDate(entry.date)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Meta: dates & notes */}
      <Card>
        <CardContent className="space-y-3 p-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Başlangıç</span>
            <span className="font-medium">{formatFullDate(goal.startDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Hedef Tarihi</span>
            <span className="font-medium">{formatFullDate(goal.targetDate)}</span>
          </div>
          {goal.reminderTime && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hatırlatma</span>
              <span className="font-medium tabular-nums">{goal.reminderTime}</span>
            </div>
          )}
          {goal.notes && (
            <div className="border-t border-border pt-3">
              <p className="mb-1 text-muted-foreground">Notlar</p>
              <p className="leading-relaxed">{goal.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button asChild variant="outline" className="flex-1">
          <Link href={`/goals/${goal.id}/edit`}>
            <Pencil aria-hidden="true" />
            Düzenle
          </Link>
        </Button>
        <Button variant="destructive" className="flex-1" onClick={() => setDeleteOpen(true)}>
          <Trash2 aria-hidden="true" />
          Sil
        </Button>
      </div>

      {/* Delete confirmation */}
      <Modal open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Hedefi sil</ModalTitle>
            <ModalDescription>
              &ldquo;{goal.title}&rdquo; hedefini silmek istediğine emin misin? Bu işlem geri
              alınamaz.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              İptal
            </Button>
            <Button variant="destructive" onClick={handleDelete} isLoading={deleting}>
              Sil
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

/** Compact labeled statistic tile. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-center">
      <p className="text-base font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
