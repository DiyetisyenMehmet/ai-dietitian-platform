import * as React from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Droplets,
  Flame,
  Info,
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
import {
  comparisonDeltaText,
  comparisonMissingNote,
  comparisonValueText,
  weightComparisonPresentation,
  type ComparisonValueFormat,
} from "@/application/history/history-comparison-format";
import { dailyHistoryMetricRoute } from "@/application/history/history-navigation";
import { cn } from "@/shared/lib/utils";

export type HistoryMetricTone =
  | "nutrition"
  | "protein"
  | "water"
  | "activity"
  | "sleep"
  | "weight"
  | "neutral";

const CARD_TONE: Record<
  HistoryMetricTone,
  { card: string; icon: string; shareCard: string; shareIcon: string }
> = {
  nutrition: {
    card: "border-rose-100 bg-rose-50/55 dark:border-rose-900/45 dark:bg-rose-950/20",
    icon: "bg-rose-100 text-rose-500 dark:bg-rose-900/40 dark:text-rose-300",
    shareCard: "border-rose-100 bg-rose-50/70",
    shareIcon: "bg-rose-100 text-rose-500",
  },
  protein: {
    card: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/45 dark:bg-emerald-950/20",
    icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300",
    shareCard: "border-emerald-100 bg-emerald-50/75",
    shareIcon: "bg-emerald-100 text-emerald-600",
  },
  water: {
    card: "border-sky-100 bg-sky-50/60 dark:border-sky-900/45 dark:bg-sky-950/20",
    icon: "bg-sky-100 text-cyan-600 dark:bg-sky-900/40 dark:text-sky-300",
    shareCard: "border-sky-100 bg-sky-50/80",
    shareIcon: "bg-sky-100 text-cyan-600",
  },
  activity: {
    card: "border-teal-100 bg-teal-50/60 dark:border-teal-900/45 dark:bg-teal-950/20",
    icon: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300",
    shareCard: "border-teal-100 bg-teal-50/75",
    shareIcon: "bg-teal-100 text-teal-600",
  },
  sleep: {
    card: "border-indigo-100 bg-indigo-50/50 dark:border-indigo-900/45 dark:bg-indigo-950/20",
    icon: "bg-indigo-100 text-cyan-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    shareCard: "border-indigo-100 bg-indigo-50/70",
    shareIcon: "bg-indigo-100 text-cyan-700",
  },
  weight: {
    card: "border-rose-100 bg-red-50/45 dark:border-rose-900/45 dark:bg-rose-950/20",
    icon: "bg-rose-100 text-rose-500 dark:bg-rose-900/40 dark:text-rose-300",
    shareCard: "border-rose-100 bg-red-50/60",
    shareIcon: "bg-rose-100 text-rose-500",
  },
  neutral: {
    card: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/35",
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    shareCard: "border-slate-200 bg-slate-50",
    shareIcon: "bg-slate-100 text-slate-600",
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

export function HistoryMetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  href,
  ariaLabel,
  variant = "normal",
}: {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone: HistoryMetricTone;
  href?: string;
  ariaLabel?: string;
  variant?: "normal" | "share";
}) {
  const palette = CARD_TONE[tone];
  const share = variant === "share";
  const className = cn(
    "flex min-h-[82px] min-w-0 items-center gap-2 rounded-[19px] border px-2.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] sm:px-3",
    share && "min-h-[94px] gap-3 rounded-[22px] px-3.5 py-3 shadow-sm",
    href &&
      !share &&
      "cursor-pointer transition-[transform,box-shadow,border-color] hover:border-foreground/15 hover:shadow-sm active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2",
    share ? palette.shareCard : palette.card,
  );
  const content = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11",
          share ? palette.shareIcon : palette.icon,
        )}
      >
        <Icon className="size-5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[11px] font-medium leading-tight text-foreground/80 sm:text-xs",
            share && "text-[13px] text-slate-600 sm:text-[13px]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-1 break-normal text-[15px] font-extrabold leading-[1.12] tracking-[-0.025em] [hyphens:none] sm:text-[18px]",
            share && "whitespace-nowrap text-[17px] text-slate-950 sm:text-[17px]",
          )}
        >
          {value}
        </p>
        {helper && (
          <p className={cn("mt-1 text-[10px] text-muted-foreground", share && "text-slate-500")}>
            {helper}
          </p>
        )}
      </div>
      {href && (
        <ChevronRight
          className="size-4 shrink-0 text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        />
      )}
    </>
  );

  return href && !share ? (
    <Link href={href} aria-label={ariaLabel ?? `${label} detayını aç`} className={className}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

export function HistorySectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
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
      <div className="space-y-5">
        <EmptyState
          icon={CalendarDays}
          title="Bu gün için henüz kayıt bulunmuyor"
          description="Beslenme, su, hareket, uyku veya kilo kaydı eklediğinde günün özeti burada oluşur."
        />
        <section>
          <HistorySectionHeading title="Öğünler" />
          <p className="rounded-[18px] border border-dashed border-border/80 bg-muted/25 px-3.5 py-3 text-[12px] text-muted-foreground">
            Bu gün için öğün kaydı bulunmuyor.
          </p>
        </section>
      </div>
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
        <HistorySectionHeading
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
          <HistoryMetricCard
            label="Toplam kalori"
            value={observedText(history.nutrition.totals.calories, " kcal")}
            icon={Flame}
            tone="nutrition"
            href={dailyHistoryMetricRoute(history, "calories") ?? undefined}
            ariaLabel="Toplam kalori için beslenme kayıtlarını aç"
          />
          <HistoryMetricCard
            label="Protein"
            value={observedText(
              history.nutrition.totals.proteinG,
              " g",
              1,
              "Besin değeri bulunmuyor",
            )}
            icon={UtensilsCrossed}
            tone="protein"
            href={dailyHistoryMetricRoute(history, "protein") ?? undefined}
            ariaLabel="Protein için beslenme kayıtlarını aç"
          />
          <HistoryMetricCard
            label="Su"
            value={waterText(history.water.totalMl)}
            icon={Droplets}
            tone="water"
            href={dailyHistoryMetricRoute(history, "water") ?? undefined}
            ariaLabel="Su takip ekranını aç"
          />
          <HistoryMetricCard
            label="Aktivite süresi"
            value={observedDuration(history.activity.totalActiveMinutes)}
            icon={Activity}
            tone="activity"
            href={dailyHistoryMetricRoute(history, "activity") ?? undefined}
            ariaLabel="Aktivite kayıtlarını aç"
          />
          <HistoryMetricCard
            label="Uyku"
            value={observedDuration(history.sleep.totalDurationMinutes, "Uyku kaydı yok")}
            icon={Moon}
            tone="sleep"
            href={dailyHistoryMetricRoute(history, "sleep") ?? undefined}
            ariaLabel="Uyku kayıtlarını aç"
          />
          <HistoryMetricCard
            label="Kilo"
            value={weight}
            icon={Scale}
            tone="weight"
            href={dailyHistoryMetricRoute(history, "weight") ?? undefined}
            ariaLabel="Kilo kayıtlarını aç"
          />
        </div>
      </section>

      <section>
        <HistorySectionHeading
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
        {history.nutrition.meals.length > 0 ? (
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
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-[18px] border border-dashed border-border/80 bg-muted/25 px-3.5 py-3 text-[12px] text-muted-foreground">
            Bu gün için öğün kaydı bulunmuyor.
          </p>
        )}
      </section>

      {history.timeline.length > 0 && (
        <section>
          <HistorySectionHeading
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
          <div className="max-w-full touch-pan-x snap-x snap-proximity overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ol className="relative flex w-max min-w-full justify-between gap-2 pl-1 pr-4">
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
                const palette = CARD_TONE[row[3] as HistoryMetricTone];
                return (
                  <li
                    key={event.id}
                    className="relative z-10 w-[82px] shrink-0 snap-start text-center"
                  >
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

const COMPARISON_TONE: Record<
  HistoryMetricTone,
  {
    card: string;
    icon: string;
    values: string;
    badge: string;
    divider: string;
    shareCard: string;
    shareIcon: string;
    shareValues: string;
    shareBadge: string;
    shareDivider: string;
  }
> = {
  nutrition: {
    card: "border-rose-100 bg-rose-50/40 dark:border-rose-900/45 dark:bg-rose-950/20",
    icon: "bg-rose-100/90 text-rose-500 dark:bg-rose-900/45 dark:text-rose-300",
    values: "bg-white/55 dark:bg-rose-950/25",
    badge: "bg-rose-100/60 dark:bg-rose-900/30",
    divider: "border-rose-200/60 dark:border-rose-900/50",
    shareCard: "border-rose-100 bg-rose-50/55",
    shareIcon: "bg-rose-100 text-rose-500",
    shareValues: "bg-white/80",
    shareBadge: "bg-rose-100/80",
    shareDivider: "border-rose-200/70",
  },
  protein: {
    card: "border-emerald-100 bg-emerald-50/45 dark:border-emerald-900/45 dark:bg-emerald-950/20",
    icon: "bg-emerald-100/90 text-emerald-600 dark:bg-emerald-900/45 dark:text-emerald-300",
    values: "bg-white/50 dark:bg-emerald-950/25",
    badge: "bg-emerald-100/60 dark:bg-emerald-900/30",
    divider: "border-emerald-200/60 dark:border-emerald-900/50",
    shareCard: "border-emerald-100 bg-emerald-50/60",
    shareIcon: "bg-emerald-100 text-emerald-600",
    shareValues: "bg-white/80",
    shareBadge: "bg-emerald-100/80",
    shareDivider: "border-emerald-200/70",
  },
  water: {
    card: "border-cyan-100 bg-cyan-50/45 dark:border-cyan-900/45 dark:bg-cyan-950/20",
    icon: "bg-cyan-100/90 text-teal-500 dark:bg-cyan-900/45 dark:text-cyan-300",
    values: "bg-white/50 dark:bg-cyan-950/25",
    badge: "bg-cyan-100/60 dark:bg-cyan-900/30",
    divider: "border-cyan-200/60 dark:border-cyan-900/50",
    shareCard: "border-cyan-100 bg-cyan-50/60",
    shareIcon: "bg-cyan-100 text-teal-500",
    shareValues: "bg-white/80",
    shareBadge: "bg-cyan-100/80",
    shareDivider: "border-cyan-200/70",
  },
  activity: {
    card: "border-teal-100 bg-teal-50/45 dark:border-teal-900/45 dark:bg-teal-950/20",
    icon: "bg-teal-100/90 text-teal-600 dark:bg-teal-900/45 dark:text-teal-300",
    values: "bg-white/50 dark:bg-teal-950/25",
    badge: "bg-teal-100/60 dark:bg-teal-900/30",
    divider: "border-teal-200/60 dark:border-teal-900/50",
    shareCard: "border-teal-100 bg-teal-50/60",
    shareIcon: "bg-teal-100 text-teal-600",
    shareValues: "bg-white/80",
    shareBadge: "bg-teal-100/80",
    shareDivider: "border-teal-200/70",
  },
  sleep: {
    card: "border-sky-100 bg-sky-50/40 dark:border-sky-900/45 dark:bg-sky-950/20",
    icon: "bg-sky-100/90 text-teal-600 dark:bg-sky-900/45 dark:text-sky-300",
    values: "bg-white/50 dark:bg-sky-950/25",
    badge: "bg-sky-100/60 dark:bg-sky-900/30",
    divider: "border-sky-200/60 dark:border-sky-900/50",
    shareCard: "border-sky-100 bg-sky-50/55",
    shareIcon: "bg-sky-100 text-teal-600",
    shareValues: "bg-white/80",
    shareBadge: "bg-sky-100/80",
    shareDivider: "border-sky-200/70",
  },
  weight: {
    card: "border-rose-100 bg-red-50/45 dark:border-rose-900/45 dark:bg-rose-950/20",
    icon: "bg-rose-100/90 text-rose-500 dark:bg-rose-900/45 dark:text-rose-300",
    values: "bg-white/50 dark:bg-rose-950/25",
    badge: "bg-rose-100/60 dark:bg-rose-900/30",
    divider: "border-rose-200/60 dark:border-rose-900/50",
    shareCard: "border-rose-100 bg-red-50/55",
    shareIcon: "bg-rose-100 text-rose-500",
    shareValues: "bg-white/80",
    shareBadge: "bg-rose-100/80",
    shareDivider: "border-rose-200/70",
  },
  neutral: {
    card: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/35",
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    values: "bg-white/60 dark:bg-slate-900/40",
    badge: "bg-slate-100 dark:bg-slate-800",
    divider: "border-slate-200 dark:border-slate-700",
    shareCard: "border-slate-200 bg-slate-50",
    shareIcon: "bg-slate-100 text-slate-600",
    shareValues: "bg-white/80",
    shareBadge: "bg-slate-100",
    shareDivider: "border-slate-200",
  },
};

function deltaTextClass(metric: MetricComparison | undefined, neutralDelta: boolean) {
  if (neutralDelta || !metric || !metric.comparisonAvailable || metric.absoluteChange === null) {
    return "text-foreground";
  }
  if (metric.direction === "UP") return "text-teal-600 dark:text-teal-300";
  if (metric.direction === "DOWN") return "text-rose-600 dark:text-rose-300";
  return "text-foreground";
}

function comparisonCoverageText(value: PeriodCategoryCompleteness) {
  return value.status === "UNAVAILABLE"
    ? "Kapsam alınamadı"
    : `${value.recordedDays}/${value.expectedDays} gün kayıt`;
}

export function HistoryComparisonMetricCard({
  title,
  description,
  icon: Icon,
  currentLabel,
  previousLabel,
  currentValue,
  previousValue,
  difference,
  coverage,
  note,
  metric,
  tone,
  neutralDelta = false,
  variant = "normal",
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  currentLabel: string;
  previousLabel: string;
  currentValue: string;
  previousValue: string;
  difference: string;
  coverage: string;
  note?: string | null;
  metric?: MetricComparison;
  tone: HistoryMetricTone;
  neutralDelta?: boolean;
  variant?: "normal" | "share";
}) {
  const palette = COMPARISON_TONE[tone];
  const share = variant === "share";
  return (
    <article
      className={cn(
        "overflow-hidden rounded-[22px] border shadow-sm",
        share ? palette.shareCard : palette.card,
      )}
    >
      <div className="flex min-h-[72px] items-center justify-between gap-2.5 px-3 py-2.5 sm:px-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              share ? palette.shareIcon : palette.icon,
            )}
          >
            <Icon className="size-5" strokeWidth={2.15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold leading-tight tracking-[-0.015em] sm:text-[15px]">
              {title}
            </h3>
            <p
              className={cn(
                "mt-1 text-[10px] leading-tight text-muted-foreground sm:text-[11px]",
                share && "text-slate-500",
              )}
            >
              {description}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium text-muted-foreground",
            share && "text-slate-500",
            share ? palette.shareBadge : palette.badge,
          )}
        >
          {coverage}
        </span>
      </div>

      <div
        className={cn(
          "mx-2 mb-2 grid grid-cols-3 overflow-hidden rounded-[15px]",
          share ? palette.shareValues : palette.values,
        )}
      >
        {[
          [currentLabel, currentValue],
          [previousLabel, previousValue],
          ["Fark", difference],
        ].map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "min-w-0 px-1.5 py-2.5 text-center sm:px-2",
              index > 0 && "border-l",
              index > 0 && (share ? palette.shareDivider : palette.divider),
            )}
          >
            <p
              className={cn(
                "truncate text-[10px] font-medium leading-tight text-muted-foreground sm:text-[11px]",
                share && "text-slate-500",
              )}
            >
              {label}
            </p>
            <p
              className={cn(
                "mt-1.5 break-words text-[14px] font-extrabold tabular-nums leading-tight tracking-[-0.025em] sm:text-[16px]",
                index === 2 && deltaTextClass(metric, neutralDelta),
                share && "text-slate-950",
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
      {note && (
        <p
          className={cn(
            "px-3 pb-2.5 text-[10px] leading-snug text-muted-foreground",
            share && "text-slate-500",
          )}
        >
          {note}
        </p>
      )}
    </article>
  );
}

export function PeriodComparisonSection({ comparison }: { comparison: HistoryComparisonResponse }) {
  const custom = comparison.periodType === "CUSTOM";
  const week = comparison.periodType === "WEEK";
  const currentLabel = custom ? "1. dönem" : week ? "Bu hafta" : "Bu ay";
  const previousLabel = custom ? "2. dönem" : week ? "Geçen hafta" : "Geçen ay";
  const current = comparison.completeness.current;
  const previous = comparison.completeness.previous;

  const calories = comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay;
  const protein = comparison.metrics.nutrition.averageProteinGPerQuantifiedDay;
  const water = comparison.metrics.water.averageMlPerRecordedDay;
  const activity = comparison.metrics.activity.totalActiveMinutes;
  const sleep = comparison.metrics.sleep.averageDurationPerRecordedNight;
  const weight = comparison.metrics.weight.netChangeKg;
  const weightPresentation = weightComparisonPresentation(
    weight,
    current.weight.measurementCount,
    previous.weight.measurementCount,
  );

  const value = (
    metric: MetricComparison,
    side: "current" | "previous",
    format: ComparisonValueFormat,
    unit = "",
    digits = 0,
  ) => comparisonValueText(metric[side], format, unit, digits);

  return (
    <section className="space-y-3" aria-label="Dönem karşılaştırması">
      <div className="space-y-3">
        <HistoryComparisonMetricCard
          title="Ortalama kalori"
          description="Besin değeri bulunan günlerin ortalaması."
          icon={Flame}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={value(calories, "current", "number", " kcal")}
          previousValue={value(calories, "previous", "number", " kcal")}
          difference={comparisonDeltaText(calories, "number", " kcal")}
          coverage={comparisonCoverageText(current.nutrition)}
          note={comparisonMissingNote(calories)}
          metric={calories}
          tone="nutrition"
          neutralDelta
        />
        <HistoryComparisonMetricCard
          title="Protein"
          description="Besin değeri bulunan günlerin ortalaması."
          icon={UtensilsCrossed}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={value(protein, "current", "number", " g", 1)}
          previousValue={value(protein, "previous", "number", " g", 1)}
          difference={comparisonDeltaText(protein, "number", " g", 1)}
          coverage={comparisonCoverageText(current.nutrition)}
          note={comparisonMissingNote(protein)}
          metric={protein}
          tone="protein"
        />
        <HistoryComparisonMetricCard
          title="Su"
          description="Su kaydı bulunan günlerin ortalaması."
          icon={Droplets}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={value(water, "current", "water")}
          previousValue={value(water, "previous", "water")}
          difference={comparisonDeltaText(water, "water")}
          coverage={comparisonCoverageText(current.water)}
          note={comparisonMissingNote(water)}
          metric={water}
          tone="water"
        />
        <HistoryComparisonMetricCard
          title="Toplam aktivite süresi"
          description="Dönemde kaydedilen toplam süre."
          icon={Activity}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={value(activity, "current", "duration")}
          previousValue={value(activity, "previous", "duration")}
          difference={comparisonDeltaText(activity, "duration")}
          coverage={comparisonCoverageText(current.activity)}
          note={comparisonMissingNote(activity)}
          metric={activity}
          tone="activity"
        />
        <HistoryComparisonMetricCard
          title="Ortalama uyku süresi"
          description="Kaydedilen gecelerin ortalaması."
          icon={Moon}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={value(sleep, "current", "duration")}
          previousValue={value(sleep, "previous", "duration")}
          difference={comparisonDeltaText(sleep, "duration")}
          coverage={comparisonCoverageText(current.sleep)}
          note={comparisonMissingNote(sleep)}
          metric={sleep}
          tone="sleep"
        />
        <HistoryComparisonMetricCard
          title="Kilo değişimi"
          description="Dönem içindeki net değişim."
          icon={Scale}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          currentValue={weightPresentation.currentValue}
          previousValue={weightPresentation.previousValue}
          difference={weightPresentation.difference}
          coverage={
            current.weight.sourceStatus === "UNAVAILABLE"
              ? "Ölçüm alınamadı"
              : `${current.weight.measurementCount} ölçüm`
          }
          note={weightPresentation.note}
          metric={weight}
          tone="weight"
          neutralDelta
        />
      </div>

      <p className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {comparison.comparisonMode === "CUSTOM_EQUAL_RANGES"
            ? "Özel dönemler aynı sayıda yerel takvim günü üzerinden karşılaştırılır. "
            : (comparison.comparisonMode === "EQUAL_ELAPSED_DAYS" ||
                  comparison.comparisonMode === "EQUAL_ELAPSED_DAYS_CLAMPED") &&
                "Dönemler aynı sayıda geçen güne göre karşılaştırılır. "}
          Fark renkleri yalnız değişimin yönünü gösterir; sağlık sonucu değerlendirmesi değildir.
          Kayıt sayısı düşük olduğunda karşılaştırma sınırlı olabilir.
        </span>
      </p>
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
        <HistorySectionHeading
          title={comparison.periodType === "WEEK" ? "Haftanın Özeti" : "Ayın Özeti"}
          action={
            <span className="text-right text-[10px] leading-tight text-muted-foreground">
              {formatDate(comparison.currentPeriod.localStartDate)} –<br />
              {formatDate(comparison.currentPeriod.localEndDateInclusive)}
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-2.5">
          <HistoryMetricCard
            label="Ortalama kalori"
            value={observedText(
              comparison.metrics.nutrition.averageCaloriesPerQuantifiedDay.current,
              " kcal",
            )}
            helper={coverageText(current.nutrition)}
            icon={Flame}
            tone="nutrition"
          />
          <HistoryMetricCard
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
          <HistoryMetricCard
            label="Ortalama su"
            value={waterText(comparison.metrics.water.averageMlPerRecordedDay.current)}
            helper={coverageText(current.water)}
            icon={Droplets}
            tone="water"
          />
          <HistoryMetricCard
            label="Aktivite süresi"
            value={observedDuration(comparison.metrics.activity.totalActiveMinutes.current)}
            helper={coverageText(current.activity)}
            icon={Activity}
            tone="activity"
          />
          <HistoryMetricCard
            label="Ortalama uyku"
            value={observedDuration(
              comparison.metrics.sleep.averageDurationPerRecordedNight.current,
              "Uyku kaydı yok",
            )}
            helper={coverageText(current.sleep)}
            icon={Moon}
            tone="sleep"
          />
          <HistoryMetricCard
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
