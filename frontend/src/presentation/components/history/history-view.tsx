"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Leaf,
  RefreshCw,
  Share2,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/application/auth/auth-store";
import {
  buildComparisonHistorySharePayload,
  buildDailyHistorySharePayload,
  type HistoryShareOptions,
} from "@/application/history/history-share";
import {
  dateKeyForTimezone,
  historyRequestKey,
  historyStore,
  shiftCalendarDate,
  shiftCalendarMonth,
  useHistoryState,
} from "@/application/history/history-store";
import type { HistoryMode } from "@/domain/history/types";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { HistoryShareDialog } from "@/presentation/components/history/history-share-dialog";
import {
  DailyHistoryOverview,
  PeriodHistoryOverview,
} from "@/presentation/components/history/history-overview";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { Skeleton } from "@/presentation/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const MODE_LABEL: Record<HistoryMode, string> = {
  DAY: "Günlük",
  WEEK: "Haftalık",
  MONTH: "Aylık",
};

function formatDateOnly(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function LoadingHistory() {
  return (
    <div className="space-y-4" aria-label="Geçmiş yükleniyor">
      <Skeleton className="h-28 w-full rounded-[26px]" />
      <Skeleton className="h-48 w-full rounded-[26px]" />
      <Skeleton className="h-44 w-full rounded-[26px]" />
    </div>
  );
}

export function HistoryView() {
  const auth = useAuth();
  const state = useHistoryState();
  const [mode, setMode] = React.useState<HistoryMode>("DAY");
  const [timezone, setTimezone] = React.useState<string | null>(null);
  const [timezoneError, setTimezoneError] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState("");
  const [shareOpen, setShareOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!zone) throw new Error("timezone unavailable");
      setTimezone(zone);
      setSelectedDate((current) => current || dateKeyForTimezone(zone));
      setTimezoneError(false);
    } catch {
      setTimezone(null);
      setTimezoneError(true);
    }
  }, []);

  const today = timezone ? dateKeyForTimezone(timezone) : "";
  const userId = auth.user?.id ?? null;
  const expectedKey =
    userId && timezone && selectedDate
      ? historyRequestKey(userId, mode, selectedDate, timezone)
      : null;

  React.useEffect(() => {
    if (!userId || !timezone || !selectedDate) return;
    void historyStore.load({ userId, mode, date: selectedDate, timezone });
  }, [mode, selectedDate, timezone, userId]);

  React.useEffect(() => {
    if (
      !userId ||
      !timezone ||
      !selectedDate ||
      !expectedKey ||
      state.requestKey !== expectedKey ||
      state.dataStatus !== "success"
    ) {
      return;
    }
    void historyStore.loadInsight({ userId, mode, date: selectedDate, timezone });
  }, [expectedKey, mode, selectedDate, state.dataStatus, state.requestKey, timezone, userId]);

  const move = (delta: number) => {
    setSelectedDate((current) =>
      mode === "MONTH" ? shiftCalendarMonth(current, delta) : shiftCalendarDate(current, delta),
    );
  };

  const nextCandidate =
    selectedDate && today
      ? mode === "MONTH"
        ? shiftCalendarMonth(selectedDate, 1)
        : shiftCalendarDate(selectedDate, 1)
      : "";
  const canMoveNext = Boolean(today && nextCandidate && nextCandidate <= today);

  const buildSharePayload = React.useCallback(
    (options: HistoryShareOptions) => {
      if (mode === "DAY" && state.daily) {
        return buildDailyHistorySharePayload(state.daily, options, state.insight);
      }
      if (state.comparison) {
        return buildComparisonHistorySharePayload(state.comparison, options, state.insight);
      }
      throw new Error("History share payload is unavailable.");
    },
    [mode, state.comparison, state.daily, state.insight],
  );

  if (timezoneError) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Saat dilimi belirlenemedi"
        description="Geçmiş kayıtlarını doğru güne yerleştirebilmek için cihazın saat dilimi bilgisine ihtiyaç var."
        action={{ label: "Tekrar dene", onClick: () => window.location.reload() }}
      />
    );
  }

  const keyMatches = expectedKey !== null && state.requestKey === expectedKey;
  const dataReady = keyMatches && state.dataStatus === "success";

  return (
    <div className="space-y-4 pb-2">
      <header className="flex items-start justify-between gap-4 px-1">
        <h1 className="text-[28px] font-extrabold tracking-[-0.04em] sm:text-3xl">Geçmişim</h1>
        <p className="max-w-[150px] pt-0.5 text-right text-[11px] leading-[1.35] text-slate-500 dark:text-slate-400 sm:text-xs">
          Geçmişine bak,
          <br />
          daha iyi bir sen için ilham al.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-full border border-border/60 bg-muted/35 p-1">
        {(Object.keys(MODE_LABEL) as HistoryMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold transition",
              mode === item
                ? "bg-emerald-100/80 text-emerald-950 shadow-sm dark:bg-emerald-900/45 dark:text-emerald-100"
                : "text-muted-foreground",
            )}
          >
            {MODE_LABEL[item]}
          </button>
        ))}
      </div>

      <section className="space-y-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
          <div className="flex min-h-[54px] items-center rounded-[17px] border border-border/70 bg-card px-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={() => move(-1)}
              aria-label="Önceki dönem"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Button>
            <CalendarDays className="ml-1 size-5 shrink-0 text-emerald-500" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[13px] font-bold tracking-tight sm:text-sm">
                {selectedDate ? formatDateOnly(selectedDate) : "Tarih hazırlanıyor"}
              </p>
              {selectedDate && (
                <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                  {new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long" }).format(
                    new Date(`${selectedDate}T12:00:00.000Z`),
                  )}
                </p>
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={() => move(1)}
              disabled={!canMoveNext}
              aria-label="Sonraki dönem"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </Button>
          </div>

          <label className="relative inline-flex min-h-[54px] cursor-pointer items-center justify-center gap-1.5 rounded-[17px] border border-border/70 bg-card px-2 text-xs font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
            <CalendarDays className="size-5 text-emerald-500" aria-hidden="true" />
            Takvim
            <Input
              type="date"
              aria-label="Takvimden tarih seç"
              max={today || undefined}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        {mode === "DAY" && today && (
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ["Bugün", today],
              ["Dün", shiftCalendarDate(today, -1)],
              ["1 hafta önce", shiftCalendarDate(today, -7)],
              ["1 ay önce", shiftCalendarMonth(today, -1)],
            ].map(([label, date]) => (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "min-h-9 min-w-0 rounded-full border px-1 text-[10px] font-medium sm:text-xs",
                  selectedDate === date
                    ? "border-emerald-200 bg-emerald-100/80 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200"
                    : "border-transparent bg-muted/55 text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>

      {!keyMatches || state.dataStatus === "loading" || !selectedDate ? (
        <LoadingHistory />
      ) : state.dataStatus === "error" ? (
        <EmptyState
          icon={RefreshCw}
          title="Geçmiş yüklenemedi"
          description={state.error ?? "Bağlantını kontrol edip tekrar deneyebilirsin."}
          action={{
            label: "Tekrar dene",
            onClick: () => {
              if (userId && timezone && selectedDate) {
                void historyStore.load({ userId, mode, date: selectedDate, timezone });
              }
            },
          }}
        />
      ) : (
        <>
          {mode === "DAY" && state.daily && <DailyHistoryOverview history={state.daily} />}
          {mode !== "DAY" && state.comparison && (
            <PeriodHistoryOverview comparison={state.comparison} />
          )}

          <section className="relative overflow-hidden rounded-[21px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-background to-cyan-50/90 p-3.5 shadow-[0_2px_10px_rgba(16,185,129,0.06)] dark:border-emerald-900/50 dark:from-emerald-950/35 dark:via-card dark:to-sky-950/25 sm:p-4">
            <Leaf
              className="pointer-events-none absolute -bottom-4 right-1 size-20 rotate-[-18deg] text-emerald-300/25 dark:text-emerald-500/10"
              strokeWidth={1.3}
              aria-hidden="true"
            />
            <div className="relative mb-2 flex items-center gap-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/45 dark:text-emerald-300">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-[13px] font-bold">
                    {mode === "DAY"
                      ? "Diewish Günlük Değerlendirmesi"
                      : mode === "WEEK"
                        ? "Diewish Haftalık Değerlendirmesi"
                        : "Diewish Aylık Değerlendirmesi"}
                  </h2>
                  <span className="rounded-full bg-emerald-200/70 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-800/60 dark:text-emerald-200">
                    AI
                  </span>
                </div>
              </div>
            </div>
            {state.insightStatus === "loading" || state.insightStatus === "idle" ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : state.insightStatus === "error" ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  {state.insightError ??
                    "Değerlendirme şu anda alınamadı. Geçmiş verilerin kullanılmaya devam ediyor."}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    if (userId && timezone && selectedDate) {
                      void historyStore.loadInsight({ userId, mode, date: selectedDate, timezone });
                    }
                  }}
                >
                  <RefreshCw aria-hidden="true" />
                  Tekrar dene
                </Button>
              </div>
            ) : (
              <div>
                <p className="relative break-words text-[12px] leading-5 text-foreground/75 sm:text-sm">
                  {state.insight?.content.text}
                </p>
                {state.insight?.generatedBy === "FALLBACK" && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Güvenli temel değerlendirme gösteriliyor.
                  </p>
                )}
              </div>
            )}
          </section>

          <Button
            type="button"
            className="min-h-[54px] w-full rounded-full border-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-400 text-sm font-bold text-white shadow-[0_8px_20px_rgba(20,184,166,0.18)] hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-500"
            disabled={!dataReady}
            onClick={() => setShareOpen(true)}
          >
            <Share2 aria-hidden="true" />
            {mode === "DAY" ? "Günü paylaş" : mode === "WEEK" ? "Haftayı paylaş" : "Ayı paylaş"}
          </Button>
        </>
      )}

      {dataReady && (
        <HistoryShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          buildPayload={buildSharePayload}
        />
      )}
    </div>
  );
}
