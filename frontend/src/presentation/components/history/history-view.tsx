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
import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  HistoryMode,
  ObservedNumber,
} from "@/domain/history/types";
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

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function LoadingHistory() {
  return (
    <div className="space-y-4" aria-label="Geçmiş yükleniyor">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
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
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1">
        {(Object.keys(MODE_LABEL) as HistoryMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition",
              mode === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {MODE_LABEL[item]}
          </button>
        ))}
      </div>

      <SectionCard icon="calendar" title="Tarih">
        <div className="flex items-center gap-2">
          <Button type="button" size="icon" variant="outline" onClick={() => move(-1)} aria-label="Önceki dönem">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Input
            type="date"
            max={today || undefined}
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => move(1)}
            disabled={!canMoveNext}
            aria-label="Sonraki dönem"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        {mode === "DAY" && today && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDate(today)}>
              Bugün
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDate(shiftCalendarDate(today, -1))}>
              Dün
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDate(shiftCalendarDate(today, -7))}>
              1 hafta önce
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDate(shiftCalendarMonth(today, -1))}>
              1 ay önce
            </Button>
          </div>
        )}
        {selectedDate && (
          <p className="mt-3 text-xs text-muted-foreground">
            {formatDateOnly(selectedDate)} • {timezone ?? "Saat dilimi hazırlanıyor"}
          </p>
        )}
      </SectionCard>

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

          <SectionCard icon="sparkles" title="Diewish değerlendirmesi">
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
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {state.insight?.content.text}
                </p>
                {state.insight?.generatedBy === "FALLBACK" && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    AI servisi kullanılamadığında güvenli temel değerlendirme gösterildi.
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          <Button
            type="button"
            variant="outline"
            className="w-full"
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
