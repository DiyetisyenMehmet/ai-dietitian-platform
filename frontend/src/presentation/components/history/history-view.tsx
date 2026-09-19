"use client";

import * as React from "react";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Moon,
  RefreshCw,
  Scale,
  Share2,
  Sparkles,
  UtensilsCrossed,
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
  MetricComparison,
  ObservedNumber,
} from "@/domain/history/types";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { SectionCard } from "@/presentation/components/health/section-card";
import { HistoryShareDialog } from "@/presentation/components/history/history-share-dialog";
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

function observedText(
  observed: ObservedNumber,
  unit: string,
  digits = 0,
): string {
  if (observed.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (observed.state === "NO_RECORD") return "Kayıt yok";
  if (observed.state === "UNKNOWN") return "Değer bilinmiyor";
  if (observed.value === null) return "—";
  const formatted = observed.value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
  return observed.state === "PARTIAL_VALUE"
    ? `En az ${formatted}${unit} • kısmi kayıt`
    : `${formatted}${unit}`;
}

function metricText(metric: MetricComparison, unit: string, digits = 0): string {
  const current = observedText(metric.current, unit, digits);
  if (!metric.comparisonAvailable || metric.absoluteChange === null) return current;
  const change = metric.absoluteChange.toLocaleString("tr-TR", {
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  });
  const quality = metric.quality === "LIMITED" ? " • sınırlı kayıt" : "";
  return `${current} • fark ${change}${unit}${quality}`;
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "RECORDED" || status === "COMPLETE"
      ? "Kayıt var"
      : status === "PARTIAL"
        ? "Kısmi"
        : status === "UNAVAILABLE"
          ? "Alınamadı"
          : "Kayıt yok";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        (status === "RECORDED" || status === "COMPLETE") &&
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        status === "PARTIAL" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        status === "UNAVAILABLE" && "bg-red-500/10 text-red-600 dark:text-red-400",
        status === "NONE" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
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

function DailySummary({ history }: { history: DailyHistoryResponse }) {
  const empty =
    history.nutrition.status === "NONE" &&
    history.water.status === "NONE" &&
    history.activity.status === "NONE" &&
    history.sleep.status === "NONE" &&
    history.weight.status === "NONE";

  if (empty) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Bu gün için henüz kayıt bulunmuyor"
        description="Beslenme, su, aktivite, uyku veya kilo kaydı eklediğinde bu günün özeti burada oluşur."
      />
    );
  }

  return (
    <div className="space-y-4">
      {history.meta.partialResponse && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Bazı kayıt kaynaklarına şu anda ulaşılamıyor. Mevcut bilgiler gösteriliyor; erişilemeyen
          alanlar sıfır kabul edilmedi.
        </div>
      )}

      <SectionCard
        icon="calendar"
        title="Beslenme"
        action={<StatusPill status={history.nutrition.status} />}
      >
        <div className="grid grid-cols-2 gap-3">
          <MetricBox label="Kalori" value={observedText(history.nutrition.totals.calories, " kcal")} />
          <MetricBox label="Protein" value={observedText(history.nutrition.totals.proteinG, " g", 1)} />
          <MetricBox label="Karbonhidrat" value={observedText(history.nutrition.totals.carbsG, " g", 1)} />
          <MetricBox label="Yağ" value={observedText(history.nutrition.totals.fatG, " g", 1)} />
        </div>
        {history.nutrition.meals.length > 0 && (
          <div className="mt-4 space-y-2">
            {history.nutrition.meals.map((meal) => (
              <div key={meal.mealType} className="rounded-2xl bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {meal.mealType === "BREAKFAST"
                      ? "Kahvaltı"
                      : meal.mealType === "LUNCH"
                        ? "Öğle"
                        : meal.mealType === "DINNER"
                          ? "Akşam"
                          : "Ara öğün"}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {meal.nutritionKnown ? "Besin değeri kayıtlı" : "Öğün işaretlendi"}
                  </span>
                </div>
                {meal.items.map((item) => (
                  <p key={item.id} className="mt-1 text-xs text-muted-foreground">
                    {item.name ?? "Besin adı belirtilmedi"}
                    {item.calories !== null ? ` • ${Math.round(item.calories)} kcal` : ""}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon="activity"
        title="Günlük özet"
      >
        <div className="grid grid-cols-2 gap-3">
          <MetricBox label="Su" value={observedText(history.water.totalMl, " ml")} />
          <MetricBox label="Aktif süre" value={observedText(history.activity.totalActiveMinutes, " dk")} />
          <MetricBox label="Uyku" value={observedText(history.sleep.totalDurationMinutes, " dk")} />
          <MetricBox
            label="Kilo"
            value={
              history.weight.status === "UNAVAILABLE"
                ? "Şu anda alınamadı"
                : history.weight.measurement
                  ? `${history.weight.measurement.weightKg.toLocaleString("tr-TR", {
                      maximumFractionDigits: 1,
                    })} kg`
                  : "Ölçüm yok"
            }
          />
        </div>
        {!history.water.historicalGoalComparisonAvailable && history.date !== dateKeyForTimezone(history.timezone) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Geçmiş tarihler için o güne ait sürümlenmiş su hedefi bulunmadığından hedef karşılaştırması yapılmıyor.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function Timeline({ history }: { history: DailyHistoryResponse }) {
  if (history.timeline.length === 0) return null;

  const label = (event: DailyHistoryResponse["timeline"][number]): [string, string] => {
    if (event.type === "MEAL") {
      return [
        event.payload.name ?? "Öğün kaydı",
        event.payload.nutritionKnown ? "Besin değeri kayıtlı" : "Öğün işaretlendi",
      ];
    }
    if (event.type === "WATER") return ["Su", `${event.payload.amountMl} ml`];
    if (event.type === "ACTIVITY") {
      return [event.payload.name ?? "Aktivite", `${event.payload.durationMinutes} dk`];
    }
    if (event.type === "SLEEP") {
      return [
        "Uyku",
        `${event.payload.durationMinutes} dk • ${formatTime(event.payload.sleepStart)}–${formatTime(
          event.payload.wakeTime,
        )}`,
      ];
    }
    return ["Kilo ölçümü", `${event.payload.weightKg.toLocaleString("tr-TR")} kg`];
  };

  return (
    <SectionCard icon="calendar" title="Zaman çizelgesi">
      <ol className="space-y-3">
        {history.timeline.map((event) => {
          const [title, subtitle] = label(event);
          return (
            <li key={event.id} className="flex gap-3 rounded-2xl border border-border p-3">
              <div className="w-12 shrink-0 text-xs font-semibold text-primary">
                {formatTime(event.timestamp)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

function coverageLimited(comparison: HistoryComparisonResponse): boolean {
  const categories = [
    comparison.completeness.current.nutrition,
    comparison.completeness.current.water,
    comparison.completeness.current.activity,
    comparison.completeness.current.sleep,
    comparison.completeness.previous.nutrition,
    comparison.completeness.previous.water,
    comparison.completeness.previous.activity,
    comparison.completeness.previous.sleep,
  ];
  return categories.some((category) => category.status === "PARTIAL");
}

function ComparisonView({ comparison }: { comparison: HistoryComparisonResponse }) {
  const currentLabel = comparison.periodType === "WEEK" ? "Bu dönem" : "Bu ay";
  return (
    <div className="space-y-4">
      {comparison.meta.partialResponse && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Bazı kaynaklara ulaşılamadığı için karşılaştırma kısmi gösteriliyor.
        </div>
      )}
      {coverageLimited(comparison) && (
        <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Bu dönemde daha az kayıt bulunduğu için karşılaştırma sınırlı olabilir.
        </div>
      )}
      <SectionCard icon="calendar" title={currentLabel}>
        <p className="text-sm font-medium">
          {formatDateOnly(comparison.currentPeriod.localStartDate)} –{" "}
          {formatDateOnly(comparison.currentPeriod.localEndDateInclusive)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Karşılaştırılan önceki dönem: {formatDateOnly(comparison.previousPeriod.localStartDate)} –{" "}
          {formatDateOnly(comparison.previousPeriod.localEndDateInclusive)}
        </p>
      </SectionCard>

      <SectionCard icon="activity" title="Dönem karşılaştırması">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricBox
            label="Ortalama kalori"
            value={metricText(comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay, " kcal")}
          />
          <MetricBox
            label="Protein"
            value={metricText(comparison.metrics.nutrition.averageProteinGPerQuantifiedDay, " g", 1)}
          />
          <MetricBox label="Su" value={metricText(comparison.metrics.water.totalMl, " ml")} />
          <MetricBox
            label="Aktif süre"
            value={metricText(comparison.metrics.activity.totalActiveMinutes, " dk")}
          />
          <MetricBox
            label="Uyku"
            value={metricText(comparison.metrics.sleep.averageDurationPerRecordedNight, " dk")}
          />
          <MetricBox
            label="Kilo değişimi"
            value={metricText(comparison.metrics.weight.netChangeKg, " kg", 1)}
          />
        </div>
      </SectionCard>
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

  const canMoveNext = Boolean(today && selectedDate && selectedDate < today);

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
          {mode === "DAY" && state.daily && (
            <>
              <DailySummary history={state.daily} />
              <Timeline history={state.daily} />
            </>
          )}
          {mode !== "DAY" && state.comparison && <ComparisonView comparison={state.comparison} />}

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
