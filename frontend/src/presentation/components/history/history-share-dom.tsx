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
  HistorySharePayload,
  HistoryShareVisualCard,
  HistoryShareVisualTone,
} from "@/application/history/history-share";
import { DiewishHistoryMark } from "@/presentation/components/history/diewish-history-mark";
import { HistoryEvaluationCard } from "@/presentation/components/history/history-evaluation-card";
import {
  HistoryComparisonMetricCard,
  HistoryMetricCard,
  HistorySectionHeading,
  type HistoryMetricTone,
} from "@/presentation/components/history/history-overview";
import { historyShareDomModel } from "@/presentation/components/history/history-share-dom-model";
import { cn } from "@/shared/lib/utils";

const TONE_ICON: Record<HistoryShareVisualTone, LucideIcon> = {
  nutrition: Flame,
  protein: UtensilsCrossed,
  water: Droplets,
  activity: Activity,
  sleep: Moon,
  weight: Scale,
  neutral: CalendarDays,
};

function tone(card: HistoryShareVisualCard): HistoryMetricTone {
  return card.tone;
}

function evaluationTitle(payload: HistorySharePayload) {
  if (payload.scope === "DAY") return "Günlük Değerlendirme";
  if (payload.scope === "WEEK") return "Haftalık Değerlendirme";
  if (payload.scope === "MONTH") return "Aylık Değerlendirme";
  return "Özel Karşılaştırma Değerlendirmesi";
}

function SummaryCards({ cards }: { cards: HistoryShareVisualCard[] }) {
  return (
    <div className={cn("grid gap-2.5", cards.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {cards.map((card, index) => {
        const Icon = TONE_ICON[card.tone];
        const oddLast = cards.length > 1 && cards.length % 2 === 1 && index === cards.length - 1;
        return (
          <div key={`${card.title}-${card.value ?? index}`} className={cn(oddLast && "col-span-2")}>
            <HistoryMetricCard
              label={card.title}
              value={card.value ?? "—"}
              helper={card.coverage ?? card.note ?? undefined}
              icon={Icon}
              tone={tone(card)}
              variant="share"
            />
          </div>
        );
      })}
    </div>
  );
}

function ComparisonCards({ cards }: { cards: HistoryShareVisualCard[] }) {
  return (
    <div className="space-y-3">
      {cards.map((card, index) => {
        const Icon = TONE_ICON[card.tone];
        return (
          <HistoryComparisonMetricCard
            key={`${card.title}-${index}`}
            title={card.title}
            description={card.description ?? "Dönem karşılaştırması."}
            icon={Icon}
            currentLabel={card.currentLabel ?? "Bu dönem"}
            previousLabel={card.previousLabel ?? "Önceki dönem"}
            currentValue={card.currentValue ?? "—"}
            previousValue={card.previousValue ?? "—"}
            difference={card.difference ?? "—"}
            coverage={card.coverage ?? "Kapsam bilgisi yok"}
            note={card.note}
            tone={tone(card)}
            neutralDelta
            variant="share"
          />
        );
      })}
    </div>
  );
}

function SharedMeals({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <section>
      <HistorySectionHeading title="Öğünler" />
      <div className="space-y-2">
        {names.map((name, index) => (
          <article
            key={`${name}-${index}`}
            className="flex min-h-[62px] items-center gap-3 rounded-[18px] border border-slate-200 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-orange-100 to-emerald-50 text-orange-500">
              <UtensilsCrossed className="size-5" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-snug text-slate-900">
              {name}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

interface HistoryShareDomProps {
  payload: HistorySharePayload;
  captureRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

/** The single responsive DOM surface used for both preview and PNG capture. */
export function HistoryShareDom({ payload, captureRef, className }: HistoryShareDomProps) {
  const model = React.useMemo(() => historyShareDomModel(payload), [payload]);
  const comparison = payload.kind === "comparison";

  return (
    <div
      ref={captureRef}
      data-history-share-capture-root="true"
      className={cn(
        "w-full overflow-hidden bg-[linear-gradient(150deg,#edf9f3_0%,#ffffff_42%,#eef8fb_100%)] text-slate-950",
        className,
      )}
      role="img"
      aria-label={`${model.heading}, ${payload.periodLabel}`}
    >
      <header className="relative overflow-hidden bg-[linear-gradient(135deg,#087a55,#13a77a)] px-5 pb-6 pt-5 text-white">
        <span className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-20 right-16 size-32 rounded-full border border-white/10" />
        <p className="relative text-[12px] font-extrabold tracking-[0.24em]">DIEWISH</p>
        <h1 className="relative mt-4 text-[30px] font-extrabold leading-none tracking-[-0.035em]">
          {model.heading}
        </h1>
        <div className="relative mt-4 flex items-center gap-2 text-[13px] font-medium text-emerald-50">
          <CalendarDays className="size-4" aria-hidden="true" />
          <span>{payload.periodLabel}</span>
        </div>
        {payload.comparisonLabel && (
          <p className="relative mt-3 inline-flex max-w-full whitespace-normal rounded-full bg-white/15 px-3 py-1.5 text-left text-[11px] font-semibold leading-snug text-white">
            {payload.comparisonLabel}
          </p>
        )}
      </header>

      <main className="space-y-5 px-4 py-5">
        <section>
          <HistorySectionHeading title={model.heading} />
          {comparison ? (
            <ComparisonCards cards={model.cards} />
          ) : (
            <SummaryCards cards={model.cards} />
          )}
        </section>

        {!comparison && <SharedMeals names={model.mealNames} />}

        {model.aiInsight && (
          <HistoryEvaluationCard title={evaluationTitle(payload)} variant="share">
            <p className="whitespace-pre-line break-words text-[12px] leading-5 text-slate-700">
              {model.aiInsight}
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Bu değerlendirme yalnızca kaydettiğin verilere dayanır.
            </p>
          </HistoryEvaluationCard>
        )}
      </main>

      <footer className="mx-4 mb-4 rounded-[18px] border border-emerald-100 bg-white/90 px-4 py-3 shadow-sm">
        <div className="flex items-start gap-2.5">
          <DiewishHistoryMark className="mt-0.5 size-5" />
          <p
            className="break-words text-[11px] font-semibold leading-[1.55] text-slate-700"
            data-testid="history-share-motivation"
          >
            {model.motivation}
          </p>
        </div>
      </footer>
    </div>
  );
}
