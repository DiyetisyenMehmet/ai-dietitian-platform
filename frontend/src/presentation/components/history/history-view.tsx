"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  RefreshCw,
  Share2,
} from "lucide-react";

import { useAuth } from "@/application/auth/auth-store";
import { formatComparisonPeriodDateRange } from "@/application/history/history-comparison-format";
import {
  buildComparisonHistorySharePayload,
  buildDailyHistorySharePayload,
  buildPeriodHistorySharePayload,
  hasDailyHistoryShareData,
  hasPeriodHistoryShareData,
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
import { HistoryEvaluationCard } from "@/presentation/components/history/history-evaluation-card";
import { HistoryShareDialog } from "@/presentation/components/history/history-share-dialog";
import {
  DailyHistoryOverview,
  PeriodComparisonSection,
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

type HistoryViewMode = "NORMAL" | "COMPARISON";
type ComparisonMode = Extract<HistoryMode, "WEEK" | "MONTH">;

const COMPARISON_HISTORY_STATE = "diewish-history-comparison";

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
  const [viewMode, setViewMode] = React.useState<HistoryViewMode>("NORMAL");
  const [normalMode, setNormalMode] = React.useState<HistoryMode>("DAY");
  const [comparisonMode, setComparisonMode] = React.useState<ComparisonMode>("WEEK");
  const [timezone, setTimezone] = React.useState<string | null>(null);
  const [timezoneError, setTimezoneError] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState("");
  const [comparisonDate, setComparisonDate] = React.useState("");
  const [shareOpen, setShareOpen] = React.useState(false);
  const activeMode: HistoryMode = viewMode === "COMPARISON" ? comparisonMode : normalMode;
  const activeDate = viewMode === "COMPARISON" ? comparisonDate || selectedDate : selectedDate;

  React.useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setViewMode(
        event.state?.diewishHistoryView === COMPARISON_HISTORY_STATE ? "COMPARISON" : "NORMAL",
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openComparison = () => {
    const nextComparisonMode: ComparisonMode = normalMode === "MONTH" ? "MONTH" : "WEEK";
    setComparisonMode(nextComparisonMode);
    setComparisonDate(selectedDate);
    window.history.pushState(
      {
        ...window.history.state,
        diewishHistoryView: COMPARISON_HISTORY_STATE,
      },
      "",
      window.location.href,
    );
    setViewMode("COMPARISON");
  };

  const closeComparison = () => {
    if (window.history.state?.diewishHistoryView === COMPARISON_HISTORY_STATE) {
      window.history.back();
      return;
    }
    setViewMode("NORMAL");
  };

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
    userId && timezone && activeDate
      ? historyRequestKey(userId, activeMode, activeDate, timezone)
      : null;

  React.useEffect(() => {
    if (!userId || !timezone || !activeDate) return;
    void historyStore.load({ userId, mode: activeMode, date: activeDate, timezone });
  }, [activeDate, activeMode, timezone, userId]);

  React.useEffect(() => {
    if (
      !userId ||
      !timezone ||
      !activeDate ||
      viewMode !== "NORMAL" ||
      !expectedKey ||
      state.requestKey !== expectedKey ||
      state.dataStatus !== "success"
    ) {
      return;
    }
    void historyStore.loadInsight({ userId, mode: activeMode, date: activeDate, timezone });
  }, [
    activeDate,
    activeMode,
    expectedKey,
    state.dataStatus,
    state.requestKey,
    timezone,
    userId,
    viewMode,
  ]);

  const move = (delta: number) => {
    const updateDate = viewMode === "COMPARISON" ? setComparisonDate : setSelectedDate;
    updateDate((current) =>
      activeMode === "MONTH"
        ? shiftCalendarMonth(current, delta)
        : shiftCalendarDate(current, delta),
    );
  };

  const nextCandidate =
    activeDate && today
      ? activeMode === "MONTH"
        ? shiftCalendarMonth(activeDate, 1)
        : shiftCalendarDate(activeDate, 1)
      : "";
  const canMoveNext = Boolean(today && nextCandidate && nextCandidate <= today);

  const buildSharePayload = React.useCallback(
    (options: HistoryShareOptions) => {
      if (viewMode === "COMPARISON" && state.comparison) {
        return buildComparisonHistorySharePayload(state.comparison, options, state.insight);
      }
      if (normalMode === "DAY" && state.daily) {
        return buildDailyHistorySharePayload(state.daily, options, state.insight);
      }
      if (state.comparison) {
        return buildPeriodHistorySharePayload(state.comparison, options, state.insight);
      }
      throw new Error("History share payload is unavailable.");
    },
    [normalMode, state.comparison, state.daily, state.insight, viewMode],
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
  const shareAvailable =
    dataReady &&
    (viewMode === "COMPARISON"
      ? Boolean(state.comparison && hasPeriodHistoryShareData(state.comparison, true))
      : normalMode === "DAY"
        ? Boolean(state.daily && hasDailyHistoryShareData(state.daily))
        : Boolean(state.comparison && hasPeriodHistoryShareData(state.comparison)));
  const activeComparison = dataReady ? state.comparison : null;
  const comparisonPeriodText = activeComparison
    ? formatComparisonPeriodDateRange(
        activeComparison.currentPeriod.localStartDate,
        activeComparison.currentPeriod.localEndDateInclusive,
      )
    : activeDate
      ? formatDateOnly(activeDate)
      : "Dönem hazırlanıyor";
  const comparisonPreviousPeriodText = activeComparison
    ? formatComparisonPeriodDateRange(
        activeComparison.previousPeriod.localStartDate,
        activeComparison.previousPeriod.localEndDateInclusive,
      )
    : null;

  return (
    <div className="space-y-4 pb-2">
      {viewMode === "NORMAL" ? (
        <>
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
                onClick={() => setNormalMode(item)}
                className={cn(
                  "min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold transition",
                  normalMode === item
                    ? "bg-emerald-100/80 text-emerald-950 shadow-sm dark:bg-emerald-900/45 dark:text-emerald-100"
                    : "text-muted-foreground",
                )}
              >
                {MODE_LABEL[item]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <header className="flex min-h-9 items-center gap-1 px-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={closeComparison}
              aria-label="Normal geçmişe dön"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Button>
            <p className="text-sm font-semibold text-muted-foreground">Geçmişim</p>
          </header>

          <div className="grid grid-cols-2 gap-1 rounded-full border border-border/60 bg-muted/35 p-1">
            {(["WEEK", "MONTH"] as ComparisonMode[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`${MODE_LABEL[item]} karşılaştırma`}
                aria-pressed={comparisonMode === item}
                onClick={() => setComparisonMode(item)}
                className={cn(
                  "min-h-9 rounded-full px-3 py-1.5 text-sm font-semibold transition",
                  comparisonMode === item
                    ? "bg-emerald-100/80 text-emerald-950 shadow-sm dark:bg-emerald-900/45 dark:text-emerald-100"
                    : "text-muted-foreground",
                )}
              >
                {MODE_LABEL[item]}
              </button>
            ))}
          </div>

          <div className="grid gap-2 px-0.5 sm:grid-cols-[minmax(0,1fr)_174px] sm:items-end">
            <div className="min-w-0">
              <h1 className="text-[17px] font-extrabold tracking-[-0.045em] sm:text-2xl">
                {comparisonMode === "WEEK" ? "Haftalık" : "Aylık"} Karşılaştırma
              </h1>
              {activeComparison && comparisonPreviousPeriodText ? (
                <div
                  className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs"
                  data-testid="history-comparison-periods"
                >
                  <p className="whitespace-normal" data-testid="history-comparison-current-period">
                    <span className="font-semibold text-foreground/80">
                      {comparisonMode === "WEEK" ? "Bu hafta" : "Bu ay"}:
                    </span>{" "}
                    {comparisonPeriodText}
                  </p>
                  <p className="whitespace-normal" data-testid="history-comparison-previous-period">
                    <span className="font-semibold text-foreground/80">
                      {comparisonMode === "WEEK" ? "Geçen hafta" : "Geçen ay"}:
                    </span>{" "}
                    {comparisonPreviousPeriodText}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                  Dönem hazırlanıyor
                </p>
              )}
            </div>

            <div className="flex h-10 w-full items-center rounded-[14px] border border-border/70 bg-card px-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] sm:w-[174px]">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => move(-1)}
                aria-label="Önceki dönem"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <label className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 text-[10px] font-semibold">
                <CalendarDays className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                <span className="whitespace-nowrap" data-testid="history-selected-date">
                  {comparisonPeriodText}
                </span>
                <Input
                  type="date"
                  aria-label="Karşılaştırma dönemini seç"
                  max={today || undefined}
                  value={activeDate}
                  onChange={(event) => setComparisonDate(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => move(1)}
                disabled={!canMoveNext}
                aria-label="Sonraki dönem"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}

      {viewMode === "NORMAL" && (
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
                <p
                  className="truncate text-[13px] font-bold tracking-tight sm:text-sm"
                  data-testid="history-selected-date"
                >
                  {activeDate ? formatDateOnly(activeDate) : "Tarih hazırlanıyor"}
                </p>
                {activeDate && (
                  <p className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                    {new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long" }).format(
                      new Date(`${activeDate}T12:00:00.000Z`),
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
                value={activeDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>

          {normalMode === "DAY" && today && (
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

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-emerald-200/80 px-3 text-xs text-emerald-700 shadow-none dark:border-emerald-900 dark:text-emerald-300"
              onClick={openComparison}
            >
              <GitCompareArrows aria-hidden="true" />
              Karşılaştır
            </Button>
          </div>
        </section>
      )}

      {!keyMatches || state.dataStatus === "loading" || !activeDate ? (
        <LoadingHistory />
      ) : state.dataStatus === "error" ? (
        <EmptyState
          icon={RefreshCw}
          title="Geçmiş yüklenemedi"
          description={state.error ?? "Bağlantını kontrol edip tekrar deneyebilirsin."}
          action={{
            label: "Tekrar dene",
            onClick: () => {
              if (userId && timezone && activeDate) {
                void historyStore.load({
                  userId,
                  mode: activeMode,
                  date: activeDate,
                  timezone,
                });
              }
            },
          }}
        />
      ) : (
        <>
          {viewMode === "COMPARISON" && state.comparison ? (
            <div className="space-y-4">
              <PeriodComparisonSection comparison={state.comparison} />
              <Button
                type="button"
                className="min-h-[52px] w-full rounded-full border-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-400 text-sm font-bold text-white shadow-[0_8px_20px_rgba(20,184,166,0.18)] hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-500"
                disabled={!shareAvailable}
                onClick={() => setShareOpen(true)}
              >
                <Share2 aria-hidden="true" />
                Karşılaştırmayı paylaş
              </Button>
            </div>
          ) : (
            <>
              {normalMode === "DAY" && state.daily && (
                <DailyHistoryOverview history={state.daily} />
              )}
              {normalMode !== "DAY" && state.comparison && (
                <PeriodHistoryOverview comparison={state.comparison} />
              )}

              <HistoryEvaluationCard
                title={
                  normalMode === "DAY"
                    ? "Diewish Günlük Değerlendirmesi"
                    : normalMode === "WEEK"
                      ? "Diewish Haftalık Değerlendirmesi"
                      : "Diewish Aylık Değerlendirmesi"
                }
              >
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
                        if (userId && timezone && activeDate) {
                          void historyStore.loadInsight({
                            userId,
                            mode: normalMode,
                            date: activeDate,
                            timezone,
                          });
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
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                      Bu değerlendirme yalnızca kaydettiğin verilere dayanır.
                    </p>
                    {state.insight?.generatedBy === "FALLBACK" && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Güvenli temel değerlendirme gösteriliyor.
                      </p>
                    )}
                  </div>
                )}
              </HistoryEvaluationCard>

              <Button
                type="button"
                className="min-h-[54px] w-full rounded-full border-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-400 text-sm font-bold text-white shadow-[0_8px_20px_rgba(20,184,166,0.18)] hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-500"
                disabled={!shareAvailable}
                onClick={() => setShareOpen(true)}
              >
                <Share2 aria-hidden="true" />
                {normalMode === "DAY"
                  ? "Günü paylaş"
                  : normalMode === "WEEK"
                    ? "Haftayı paylaş"
                    : "Ayı paylaş"}
              </Button>
            </>
          )}
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
