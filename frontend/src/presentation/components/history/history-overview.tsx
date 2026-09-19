import * as React from "react";
import {
  Activity,
  CalendarDays,
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
import { SectionCard } from "@/presentation/components/health/section-card";
import { cn } from "@/shared/lib/utils";

type Tone = "nutrition" | "protein" | "water" | "activity" | "sleep" | "weight";

const CARD_TONE: Record<Tone, string> = {
  nutrition: "border-orange-200/70 bg-orange-50/80 dark:border-orange-900/50 dark:bg-orange-950/20",
  protein: "border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20",
  water: "border-sky-200/70 bg-sky-50/80 dark:border-sky-900/50 dark:bg-sky-950/20",
  activity: "border-teal-200/70 bg-teal-50/80 dark:border-teal-900/50 dark:bg-teal-950/20",
  sleep: "border-indigo-200/70 bg-indigo-50/80 dark:border-indigo-900/50 dark:bg-indigo-950/20",
  weight: "border-rose-200/70 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/20",
};

function numberText(value: number, digits = 0) {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

function observedText(value: ObservedNumber, unit: string, digits = 0) {
  if (value.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (value.state === "NO_RECORD") return "Kayıt yok";
  if (value.state === "UNKNOWN") return "Değer bilinmiyor";
  if (value.value === null) return "—";
  const text = `${numberText(value.value, digits)}${unit}`;
  return value.state === "PARTIAL_VALUE" ? `En az ${text}` : text;
}

function waterText(value: ObservedNumber) {
  if (value.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (value.state === "NO_RECORD") return "Kayıt yok";
  if (value.state === "UNKNOWN") return "Değer bilinmiyor";
  if (value.value === null) return "—";
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

function observedDuration(value: ObservedNumber) {
  if (value.state === "UNAVAILABLE") return "Şu anda alınamadı";
  if (value.state === "NO_RECORD") return "Kayıt yok";
  if (value.state === "UNKNOWN") return "Değer bilinmiyor";
  if (value.value === null) return "—";
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
  return (
    <div className={cn("rounded-[22px] border p-3.5 shadow-sm", CARD_TONE[tone])}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background/75 text-primary">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-[15px] font-bold leading-tight">{value}</p>
          {helper && <p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>}
        </div>
      </div>
    </div>
  );
}

export function DailyHistoryOverview({ history }: { history: DailyHistoryResponse }) {
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

  return (
    <div className="space-y-4">
      {history.meta.partialResponse && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Bazı kayıt kaynaklarına şu anda ulaşılamıyor. Erişilemeyen alanlar sıfır kabul edilmedi.
        </div>
      )}

      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">Günün Özeti</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Kaydettiğin verilere hızlı bakış</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <MetricCard label="Toplam Kalori" value={observedText(history.nutrition.totals.calories, " kcal")} icon={Flame} tone="nutrition" />
          <MetricCard label="Protein" value={observedText(history.nutrition.totals.proteinG, " g", 1)} icon={UtensilsCrossed} tone="protein" />
          <MetricCard label="Su" value={waterText(history.water.totalMl)} icon={Droplets} tone="water" />
          <MetricCard label="Toplam Hareket Süresi" value={observedDuration(history.activity.totalActiveMinutes)} icon={Activity} tone="activity" />
          <MetricCard label="Uyku" value={observedDuration(history.sleep.totalDurationMinutes)} icon={Moon} tone="sleep" />
          <MetricCard label="Kilo" value={weight} icon={Scale} tone="weight" />
        </div>
      </section>

      {history.nutrition.meals.length > 0 && (
        <SectionCard icon="utensils" title="Öğünler" className="rounded-[26px] shadow-sm">
          <div className="space-y-2.5">
            {history.nutrition.meals.map((meal) => {
              const first = meal.items[0];
              const names = meal.items.map((item) => item.name).filter((name): name is string => Boolean(name)).slice(0, 3);
              return (
                <div key={meal.mealType} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-300">
                    <UtensilsCrossed className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{mealLabel(meal.mealType)}</p>
                      {first?.loggedAt && <span className="text-[11px] text-muted-foreground">{formatTime(first.loggedAt)}</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
                      {names.length > 0 ? names.join(", ") : meal.nutritionKnown ? "Öğün kaydı" : "Öğün işaretlendi"}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold">
                    {meal.totals.calories.value !== null ? `${numberText(meal.totals.calories.value)} kcal` : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {history.timeline.length > 0 && (
        <SectionCard icon="calendar" title="Günlük Zaman Akışı" className="rounded-[26px] shadow-sm">
          <ol className="relative">
            <span className="absolute bottom-5 left-[17px] top-5 w-px bg-border" aria-hidden="true" />
            {history.timeline.map((event) => {
              const row =
                event.type === "MEAL"
                  ? [event.payload.name ?? "Öğün kaydı", event.payload.nutritionKnown ? "Besin değeri kayıtlı" : "Öğün işaretlendi", UtensilsCrossed]
                  : event.type === "WATER"
                    ? ["Su", `${numberText(event.payload.amountMl)} ml`, Droplets]
                    : event.type === "ACTIVITY"
                      ? [event.payload.name ?? "Hareket", durationText(event.payload.durationMinutes), Activity]
                      : event.type === "SLEEP"
                        ? ["Uyku", `${durationText(event.payload.durationMinutes)} • ${formatTime(event.payload.sleepStart)}–${formatTime(event.payload.wakeTime)}`, Moon]
                        : ["Kilo ölçümü", `${numberText(event.payload.weightKg, 1)} kg`, Scale];
              const Icon = row[2] as LucideIcon;
              return (
                <li key={event.id} className="relative flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-4 ring-card">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="break-words text-sm font-semibold">{row[0] as string}</p>
                      <time className="shrink-0 text-[11px] font-medium text-primary">{formatTime(event.timestamp)}</time>
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">{row[1] as string}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </SectionCard>
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
      absolute >= 1000
        ? `${numberText(absolute / 1000, 1)} L`
        : `${numberText(absolute)} ml`;
    return metric.absoluteChange === 0 ? "Değişim yok" : `${metric.absoluteChange > 0 ? "+" : "-"}${text}`;
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
    <article className={cn("rounded-[24px] border p-3.5 shadow-sm sm:p-4", semanticCardClass(tone))}>
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
            <p className="mt-1 break-words text-xs font-bold leading-tight tabular-nums sm:text-sm">
              {value}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function PeriodComparisonSection({ comparison }: { comparison: HistoryComparisonResponse }) {
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
          Fark değeri matematiksel değişimi gösterir; hedef bağlamı yoksa iyi/kötü olarak renklendirilmez.
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
        ? "Kayıt yok"
        : weight.value === null
          ? "Değer bilinmiyor"
          : `${weight.value > 0 ? "+" : ""}${numberText(weight.value, 1)} kg`;

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">{comparison.periodType === "WEEK" ? "Haftalık Özet" : "Aylık Özet"}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(comparison.currentPeriod.localStartDate)} – {formatDate(comparison.currentPeriod.localEndDateInclusive)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <MetricCard label="Günlük Ortalama Kalori" value={observedText(comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay.current, " kcal")} helper={coverageText(current.nutrition)} icon={Flame} tone="nutrition" />
          <MetricCard label="Günlük Ortalama Protein" value={observedText(comparison.metrics.nutrition.averageProteinGPerQuantifiedDay.current, " g", 1)} helper={coverageText(current.nutrition)} icon={UtensilsCrossed} tone="protein" />
          <MetricCard label="Günlük Ortalama Su" value={waterText(comparison.metrics.water.averageMlPerRecordedDay.current)} helper={coverageText(current.water)} icon={Droplets} tone="water" />
          <MetricCard label="Toplam Hareket Süresi" value={observedDuration(comparison.metrics.activity.totalActiveMinutes.current)} helper={coverageText(current.activity)} icon={Activity} tone="activity" />
          <MetricCard label="Ortalama Uyku Süresi" value={observedDuration(comparison.metrics.sleep.averageDurationPerRecordedNight.current)} helper={coverageText(current.sleep)} icon={Moon} tone="sleep" />
          <MetricCard label="Kilo Değişimi" value={weightText} helper={`${current.weight.measurementCount} ölçüm`} icon={Scale} tone="weight" />
        </div>
      </section>

      <PeriodComparisonSection comparison={comparison} />

      <SectionCard icon="calendar" title="Kayıt Kapsamı" className="rounded-[26px] shadow-sm">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {([
            ["Beslenme", current.nutrition],
            ["Su", current.water],
            ["Hareket", current.activity],
            ["Uyku", current.sleep],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-muted/45 p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold">{coverageText(value)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Kayıt sayısı düşük olduğunda dönem özeti yalnız kaydettiğin günleri temsil eder; eksik günler sıfır kabul edilmez.
        </p>
      </SectionCard>
    </div>
  );
}
