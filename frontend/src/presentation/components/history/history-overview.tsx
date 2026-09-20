import * as React from "react";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Droplets,
  Flame,
  Moon,
  Scale,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  DailyHistoryResponse,
  HistoryComparisonResponse,
  MetricComparison,
  ObservedNumber,
  PeriodCategoryCompleteness,
} from "@/domain/history/types";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { cn } from "@/shared/lib/utils";

type Tone = "nutrition" | "protein" | "water" | "activity" | "sleep" | "weight";

const CARD_TONE: Record<Tone, { card: string; icon: string }> = {
  nutrition: {
    card: "border-rose-100 bg-rose-50/55 dark:border-rose-900/45 dark:bg-rose-950/20",
    icon: "bg-rose-100 text-rose-500 dark:bg-rose-900/40 dark:text-rose-300",
  },
  protein: {
    card: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/45 dark:bg-emerald-950/20",
    icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  water: {
    card: "border-sky-100 bg-sky-50/60 dark:border-sky-900/45 dark:bg-sky-950/20",
    icon: "bg-sky-100 text-cyan-600 dark:bg-sky-900/40 dark:text-sky-300",
  },
  activity: {
    card: "border-teal-100 bg-teal-50/60 dark:border-teal-900/45 dark:bg-teal-950/20",
    icon: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300",
  },
  sleep: {
    card: "border-indigo-100 bg-indigo-50/50 dark:border-indigo-900/45 dark:bg-indigo-950/20",
    icon: "bg-indigo-100 text-cyan-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  weight: {
    card: "border-rose-100 bg-red-50/45 dark:border-rose-900/45 dark:bg-rose-950/20",
    icon: "bg-rose-100 text-rose-500 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

function numberText(value: number, digits = 0) {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

function observedText(value: ObservedNumber, unit: string, digits = 0, missingText = "Kayıt yok") {
  if (value.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (value.state === "NO_RECORD") return missingText;
  if (value.state === "UNKNOWN") return missingText;
  if (value.value === null) return missingText;
  const text = `${numberText(value.value, digits)}${unit}`;
  return value.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function waterText(value: ObservedNumber) {
  if (value.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (value.state === "NO_RECORD") return "Kayıt yok";
  if (value.state === "UNKNOWN") return "Kayıt yok";
  if (value.value === null) return "Kayıt yok";
  const text =
    value.value >= 1000
      ? `${numberText(value.value / 1000, 1)} L`
      : `${numberText(value.value)} ml`;
  return value.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function durationText(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} dk`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} sa` : `${hours} sa ${rest} dk`;
}

function observedDuration(value: ObservedNumber, missingText = "Kayıt yok") {
  if (value.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (value.state === "NO_RECORD") return missingText;
  if (value.state === "UNKNOWN") return missingText;
  if (value.value === null) return missingText;
  const text = durationText(value.value);
  return value.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function coverageText(value: PeriodCategoryCompleteness) {
  return value.status === "UNAVAILABLE"
    ? "Kayıt bilgisi alınamadı"
    : `${value.recordedDays}/${value.expectedDays} gün kayıt`;
}

function mealLabel(type: string) {
  if (type === "BREAKFAST") return "Kahvaltı";
  if (type === "LUNCH") return "Öğle";
  if (type === "DINNER") return "Akşam";
  return "Ara öğün";
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  const palette = CARD_TONE[tone];
  return (
    <article
      className={cn(
        "flex min-h-[82px] min-w-0 items-center gap-2 rounded-[19px] border px-2.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] sm:px-3",
        palette.card,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11",
          palette.icon,
        )}
      >
        <Icon className="size-5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium leading-tight text-foreground/80 sm:text-xs">
          {label}
        </p>
        <p className="mt-1 break-words text-[16px] font-extrabold leading-[1.08] tracking-[-0.025em] sm:text-[18px]">
          {value}
        </p>
        {helper && <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>}
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-slate-500 dark:text-slate-400"
        aria-hidden="true"
      />
    </article>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-7 items-center justify-between gap-3 px-0.5">
      <h2 className="text-[19px] font-extrabold tracking-[-0.025em] sm:text-xl">{title}</h2>
      {action}
    </div>
  );
}

export function DailyHistoryOverview({ history }: { history: DailyHistoryResponse }) {
  const [showAllMeals, setShowAllMeals] = React.useState(false);
  const [showAllTimeline, setShowAllTimeline] = React.useState(false);
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
        description="Beslenme, su, hareket, uyku veya kilo kaydı eklediğinde günün özeti burada oluşur."
      />
    );
  }

  const weight =
    history.weight.status === "UNAVAILABLE"
      ? "Şu anda alınamadı"
      : history.weight.measurement
        ? `${numberText(history.weight.measurement.weightKg, 1)} kg`
        : "Ölçüm yok";
  const visibleMeals = showAllMeals ? history.nutrition.meals : history.nutrition.meals.slice(0, 3);
  const visibleTimeline = showAllTimeline ? history.timeline : history.timeline.slice(0, 4);

  return (
    <div className="space-y-5">
      {history.meta.partialResponse && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Bazı kayıt kaynaklarına şu anda ulaşılamıyor. Erişilemeyen alanlar sıfır kabul edilmedi.
        </div>
      )}

      <section>
        <SectionHeading
          title="Günün Özeti"
          action={
            <span className="flex items-center gap-1 text-right text-[10px] italic text-slate-500 dark:text-slate-400 sm:text-xs">
              Küçük adımlar, büyük değişim
              <span className="text-base not-italic text-teal-500" aria-hidden="true">
                ♡
              </span>
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-2.5">
          <MetricCard
            label="Toplam kalori"
            value={observedText(history.nutrition.totals.calories, " kcal")}
            icon={Flame}
            tone="nutrition"
          />
          <MetricCard
            label="Protein"
            value={observedText(
              history.nutrition.totals.proteinG,
              " g",
              1,
              "Besin değeri bulunmuyor",
            )}
            icon={UtensilsCrossed}
            tone="protein"
          />
          <MetricCard
            label="Su"
            value={waterText(history.water.totalMl)}
            icon={Droplets}
            tone="water"
          />
          <MetricCard
            label="Aktivite süresi"
            value={observedDuration(history.activity.totalActiveMinutes)}
            icon={Activity}
            tone="activity"
          />
          <MetricCard
            label="Uyku"
            value={observedDuration(history.sleep.totalDurationMinutes, "Uyku kaydı yok")}
            icon={Moon}
            tone="sleep"
          />
          <MetricCard label="Kilo" value={weight} icon={Scale} tone="weight" />
        </div>
      </section>

      {history.nutrition.meals.length > 0 && (
        <section>
          <SectionHeading
            title="Öğünler"
            action={
              history.nutrition.meals.length > 3 ? (
                <button
                  type="button"
                  className="flex items-center text-xs font-medium text-slate-500 hover:text-primary dark:text-slate-400"
                  onClick={() => setShowAllMeals((value) => !value)}
                >
                  {showAllMeals ? "Daha az" : "Tümünü Gör"}
                  <ChevronRight
                    className={cn("size-4 transition-transform", showAllMeals && "rotate-90")}
                    aria-hidden="true"
                  />
                </button>
              ) : null
            }
          />
          <div className="space-y-2">
            {visibleMeals.map((meal) => {
              const first = meal.items[0];
              const names = meal.items
                .map((item) => item.name)
                .filter((name): name is string => Boolean(name))
                .slice(0, 3);
              return (
                <article
                  key={meal.mealType}
                  className="flex min-h-[70px] items-center gap-2.5 rounded-[18px] border border-border/70 bg-card p-2 shadow-[0_1px_2px_rgba(15,23,42,0.025)]"
                >
                  <span className="flex size-[54px] shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-orange-100 to-emerald-50 text-orange-500 dark:from-orange-950/50 dark:to-emerald-950/40 dark:text-orange-300">
                    <UtensilsCrossed className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-bold">{mealLabel(meal.mealType)}</h3>
                      {first?.loggedAt && (
                        <time className="text-[10px] text-muted-foreground">
                          {formatTime(first.loggedAt)}
                        </time>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-[11px] leading-tight text-muted-foreground">
                      {names.length > 0
                        ? names.join(", ")
                        : meal.nutritionKnown
                          ? "Öğün kaydı"
                          : "Öğün işaretlendi"}
                    </p>
                  </div>
                  <p className="shrink-0 text-[12px] font-extrabold tabular-nums">
                    {meal.totals.calories.value !== null
                      ? `${numberText(meal.totals.calories.value)} kcal`
                      : "Besin değeri yok"}
                  </p>
                  <ChevronRight className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {history.timeline.length > 0 && (
        <section>
          <SectionHeading
            title="Günlük Zaman Akışı"
            action={
              history.timeline.length > 4 ? (
                <button
                  type="button"
                  className="flex items-center text-xs font-medium text-slate-500 hover:text-primary dark:text-slate-400"
                  onClick={() => setShowAllTimeline((value) => !value)}
                >
                  {showAllTimeline ? "Daha az" : "Tümünü Gör"}
                  <ChevronRight
                    className={cn("size-4 transition-transform", showAllTimeline && "rotate-90")}
                    aria-hidden="true"
                  />
                </button>
              ) : null
            }
          />
          <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ol className="relative flex w-max min-w-full justify-between gap-1 px-0.5">
              {visibleTimeline.length > 1 && (
                <span
                  className="absolute left-[43px] right-[43px] top-5 border-t-2 border-dotted border-slate-200 dark:border-slate-700"
                  aria-hidden="true"
                />
              )}
              {visibleTimeline.map((event) => {
                const row =
                  event.type === "MEAL"
                    ? [
                        event.payload.name ?? "Öğün kaydı",
                        event.payload.nutritionKnown ? "Besin değeri kayıtlı" : "Öğün işaretlendi",
                        UtensilsCrossed,
                        "nutrition",
                      ]
                    : event.type === "WATER"
                      ? [
                          `${numberText(event.payload.amountMl)} ml su`,
                          "Su tüketimi",
                          Droplets,
                          "water",
                        ]
                      : event.type === "ACTIVITY"
                        ? [
                            event.payload.name ?? "Hareket",
                            durationText(event.payload.durationMinutes),
                            Activity,
                            "activity",
                          ]
                        : event.type === "SLEEP"
                          ? ["Uyku", durationText(event.payload.durationMinutes), Moon, "sleep"]
                          : [
                              "Kilo ölçümü",
                              `${numberText(event.payload.weightKg, 1)} kg`,
                              Scale,
                              "weight",
                            ];
                const Icon = row[2] as LucideIcon;
                const palette = CARD_TONE[row[3] as Tone];
                return (
                  <li key={event.id} className="relative z-10 w-[86px] shrink-0 text-center">
                    <span
                      className={cn(
                        "mx-auto flex size-10 items-center justify-center rounded-full ring-4 ring-background",
                        palette.icon,
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <time className="mt-1.5 block text-[11px] font-semibold tabular-nums">
                      {formatTime(event.timestamp)}
                    </time>
                    <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-tight">
                      {row[0] as string}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                      {row[1] as string}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

type SemanticTone = "positive" | "negative" | "neutral";

function comparisonObservedText(
  value: ObservedNumber,
  formatter: (observed: ObservedNumber) => string,
) {
  return formatter(value);
}

function signedNumberText(value: number, unit: string, digits = 0) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${numberText(value, digits)}${unit}`;
}

function changeText(
  metric: MetricComparison,
  format: "number" | "water" | "duration" | "weight",
  unit = "",
  digits = 0,
) {
  if (!metric.comparisonAvailable || metric.absoluteChange === null) return "Karşılaştırılamıyor";
  if (format === "duration") {
    if (metric.absoluteChange === 0) return "Değişim yok";
    return `${metric.absoluteChange > 0 ? "+" : "-"}${durationText(Math.abs(metric.absoluteChange))}`;
  }
  if (format === "water") {
    const absolute = Math.abs(metric.absoluteChange);
    const text =
      absolute >= 1000 ? `${numberText(absolute / 1000, 1)} L` : `${numberText(absolute)} ml`;
    return metric.absoluteChange === 0
      ? "Değişim yok"
      : `${metric.absoluteChange > 0 ? "+" : "-"}${text}`;
  }
  if (format === "weight") {
    if (metric.absoluteChange === 0) return "Değişim yok";
    return `${signedNumberText(metric.absoluteChange, " kg", 1)} ${metric.absoluteChange > 0 ? "artış" : "azalış"}`;
  }
  return metric.absoluteChange === 0
    ? "Değişim yok"
    : signedNumberText(metric.absoluteChange, unit, digits);
}

function semanticCardClass(tone: SemanticTone) {
  if (tone === "positive") {
    return "border-emerald-200/80 bg-emerald-50/65 dark:border-emerald-900/50 dark:bg-emerald-950/20";
  }
  if (tone === "negative") {
    return "border-rose-200/80 bg-rose-50/65 dark:border-rose-900/50 dark:bg-rose-950/20";
  }
  return "border-border/70 bg-card";
}

function ComparisonMetricCard({
  title,
  icon: Icon,
  currentLabel,
  previousLabel,
  currentValue,
  previousValue,
  difference,
  coverage,
  tone = "neutral",
}: {
  title: string;
  icon: LucideIcon;
  currentLabel: string;
  previousLabel: string;
  currentValue: string;
  previousValue: string;
  difference: string;
  coverage: string;
  tone?: SemanticTone;
}) {
  return (
    <article
      className={cn("rounded-[24px] border p-3.5 shadow-sm sm:p-4", semanticCardClass(tone))}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <h3 className="min-w-0 text-sm font-bold leading-tight">{title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground ring-1 ring-border/60">
          {coverage}
        </span>
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border/60 bg-background/75">
        {[
          [currentLabel, currentValue],
          [previousLabel, previousValue],
          ["Fark", difference],
        ].map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "min-w-0 px-2 py-3 text-center sm:px-3",
              index > 0 && "border-l border-border/60",
            )}
          >
            <p className="min-h-7 break-words text-[9px] font-medium leading-tight text-muted-foreground sm:text-[10px]">
              {label}
            </p>
            <p className="mt-1 break-words text-xs font-bold tabular-nums leading-tight sm:text-sm">
              {value}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

export function PeriodComparisonSection({ comparison }: { comparison: HistoryComparisonResponse }) {
  const week = comparison.periodType === "WEEK";
  const currentLabel = week ? "Bu hafta" : "Bu ay";
  const previousLabel = week ? "Geçen hafta" : "Geçen ay";
  const previousFullLabel = week ? "Geçen haftanın aynı dönemi" : "Geçen ayın aynı dönemi";
  const current = comparison.completeness.current;

  const calories = comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay;
  const protein = comparison.metrics.nutrition.averageProteinGPerQuantifiedDay;
  const water = comparison.metrics.water.averageMlPerRecordedDay;
  const activity = comparison.metrics.activity.totalActiveMinutes;
  const sleep = comparison.metrics.sleep.averageDurationPerRecordedNight;
  const weight = comparison.metrics.weight.lastMeasurementKg;

  return (
    <section className="space-y-3" aria-label="Dönem karşılaştırması">
      <div className="flex flex-col gap-1 px-0.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold">Karşılaştırma</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {currentLabel} ↔ {previousFullLabel}
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Fark değeri matematiksel değişimi gösterir; hedef bağlamı yoksa iyi/kötü olarak
          renklendirilmez.
        </p>
      </div>

      <div className="space-y-3">
        <ComparisonMetricCard
          title="Günlük Ortalama Kalori"
          icon={Flame}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={comparisonObservedText(calories.current, (v) => observedText(v, " kcal"))}
          previousValue={comparisonObservedText(calories.previous, (v) => observedText(v, " kcal"))}
          difference={changeText(calories, "number", " kcal")}
          coverage={coverageText(current.nutrition)}
        />
        <ComparisonMetricCard
          title="Günlük Ortalama Protein"
          icon={UtensilsCrossed}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={comparisonObservedText(protein.current, (v) => observedText(v, " g", 1))}
          previousValue={comparisonObservedText(protein.previous, (v) => observedText(v, " g", 1))}
          difference={changeText(protein, "number", " g", 1)}
          coverage={coverageText(current.nutrition)}
        />
        <ComparisonMetricCard
          title="Günlük Ortalama Su"
          icon={Droplets}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={comparisonObservedText(water.current, waterText)}
          previousValue={comparisonObservedText(water.previous, waterText)}
          difference={changeText(water, "water")}
          coverage={coverageText(current.water)}
        />
        <ComparisonMetricCard
          title="Toplam Hareket Süresi"
          icon={Activity}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={comparisonObservedText(activity.current, observedDuration)}
          previousValue={comparisonObservedText(activity.previous, observedDuration)}
          difference={changeText(activity, "duration")}
          coverage={coverageText(current.activity)}
        />
        <ComparisonMetricCard
          title="Ortalama Uyku Süresi"
          icon={Moon}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={comparisonObservedText(sleep.current, observedDuration)}
          previousValue={comparisonObservedText(sleep.previous, observedDuration)}
          difference={changeText(sleep, "duration")}
          coverage={coverageText(current.sleep)}
        />
        <ComparisonMetricCard
          title="Kilo"
          icon={Scale}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={comparisonObservedText(weight.current, (v) => observedText(v, " kg", 1))}
          previousValue={comparisonObservedText(weight.previous, (v) => observedText(v, " kg", 1))}
          difference={changeText(weight, "weight")}
          coverage={`${current.weight.measurementCount} ölçüm`}
        />
      </div>

      {[
        current.nutrition,
        current.water,
        current.activity,
        current.sleep,
        comparison.completeness.previous.nutrition,
        comparison.completeness.previous.water,
        comparison.completeness.previous.activity,
        comparison.completeness.previous.sleep,
      ].some((value) => value.status === "PARTIAL") && (
        <p className="rounded-2xl bg-muted/50 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Karşılaştırma kayıt kapsamı nedeniyle sınırlı olabilir.
        </p>
      )}
    </section>
  );
}

export function PeriodHistoryOverview({ comparison }: { comparison: HistoryComparisonResponse }) {
  const current = comparison.completeness.current;
  const weight = comparison.metrics.weight.netChangeKg.current;
  const weightText =
    weight.state === "UNAVAILABLE"
      ? "Şu anda alınamadı"
      : weight.state === "NO_RECORD"
        ? "Ölçüm yok"
        : weight.value === null
          ? "Ölçüm yok"
          : `${weight.value > 0 ? "+" : ""}${numberText(weight.value, 1)} kg`;

  return (
    <div className="space-y-4">
      <section>
        <SectionHeading
          title={comparison.periodType === "WEEK" ? "Haftanın Özeti" : "Ayın Özeti"}
          action={
            <span className="text-right text-[10px] leading-tight text-muted-foreground">
              {formatDate(comparison.currentPeriod.localStartDate)} –<br />
              {formatDate(comparison.currentPeriod.localEndDateInclusive)}
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-2.5">
          <MetricCard
            label="Ortalama kalori"
            value={observedText(
              comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay.current,
              " kcal",
            )}
            helper={coverageText(current.nutrition)}
            icon={Flame}
            tone="nutrition"
          />
          <MetricCard
            label="Ortalama protein"
            value={observedText(
              comparison.metrics.nutrition.averageProteinGPerQuantifiedDay.current,
              " g",
              1,
              "Besin değeri bulunmuyor",
            )}
            helper={coverageText(current.nutrition)}
            icon={UtensilsCrossed}
            tone="protein"
          />
          <MetricCard
            label="Ortalama su"
            value={waterText(comparison.metrics.water.averageMlPerRecordedDay.current)}
            helper={coverageText(current.water)}
            icon={Droplets}
            tone="water"
          />
          <MetricCard
            label="Aktivite süresi"
            value={observedDuration(comparison.metrics.activity.totalActiveMinutes.current)}
            helper={coverageText(current.activity)}
            icon={Activity}
            tone="activity"
          />
          <MetricCard
            label="Ortalama uyku"
            value={observedDuration(
              comparison.metrics.sleep.averageDurationPerRecordedNight.current,
              "Uyku kaydı yok",
            )}
            helper={coverageText(current.sleep)}
            icon={Moon}
            tone="sleep"
          />
          <MetricCard
            label="Kilo değişimi"
            value={weightText}
            helper={`${current.weight.measurementCount} ölçüm`}
            icon={Scale}
            tone="weight"
          />
        </div>
      </section>

      <p className="rounded-[18px] border border-border/60 bg-muted/35 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Dönem özeti yalnız kaydettiğin günleri temsil eder; kayıt bulunmayan günler sıfır kabul
        edilmez.
      </p>
    </div>
  );
}
