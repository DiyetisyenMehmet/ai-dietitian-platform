"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
import { SectionCard } from "@/presentation/components/health/section-card";
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
  }, [
    expectedKey,
    mode,
    selectedDate,
    state.dataStatus,
    state.requestKey,
    timezone,
    userId,
  ]);

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
    <div className="space-y-5 pb-2">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/70 p-1">
        {(Object.keys(MODE_LABEL) as HistoryMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "min-h-10 rounded-xl px-3 py-2 text-sm font-semibold transition",
              mode === item
                ? "bg-background text-primary shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground",
            )}
          >
            {MODE_LABEL[item]}
          </button>
        ))}
      </div>

      <section className="rounded-[26px] border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Button type="button" size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Önceki dönem">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-base font-bold tracking-tight">
              {selectedDate ? formatDateOnly(selectedDate) : "Tarih hazırlanıyor"}
            </p>
            {selectedDate && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
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
            onClick={() => move(1)}
            disabled={!canMoveNext}
            aria-label="Sonraki dönem"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-3 flex justify-center">
          <label className="relative inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold shadow-sm">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
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
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium",
                  selectedDate === date
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
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
          {mode !== "DAY" && state.comparison && <PeriodHistoryOverview comparison={state.comparison} />}

          <section className="rounded-[26px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-background to-sky-50 p-4 shadow-sm dark:border-emerald-900/50 dark:from-emerald-950/25 dark:via-card dark:to-sky-950/20 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold">Diewish Değerlendirmesi</h2>
                <p className="text-[11px] text-muted-foreground">Kaydettiğin verilere göre kısa özet</p>
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
                  {state.insightError ?? "Değerlendirme şu anda alınamadı. Geçmiş verilerin kullanılmaya devam ediyor."}
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
                <p className="break-words text-sm leading-6 text-foreground/85">{state.insight?.content.text}</p>
                {state.insight?.generatedBy === "FALLBACK" && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    AI servisi kullanılamadığında güvenli temel değerlendirme gösterildi.
                  </p>
                )}
              </div>
            )}
          </section>

          <Button
            type="button"
            className="min-h-12 w-full rounded-2xl"
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
