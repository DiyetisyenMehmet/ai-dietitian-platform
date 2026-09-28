"use client";

import * as React from "react";

import {
  formatMicronutrientAmount,
  formatReferencePercent,
  localDateKey,
  micronutrientAriaText,
  visualProgressPercent,
} from "@/application/meals/micronutrients";
import {
  mealsClient,
  type DailyMicronutrientSummaryDto,
} from "@/infrastructure/tracking/meals-client";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";

function NutrientRows({
  items,
}: {
  items: DailyMicronutrientSummaryDto["nutrients"];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const referenceValue =
          typeof item.reference === "number" ? item.reference : undefined;
        const referencePercent =
          typeof item.referencePercent === "number" ? item.referencePercent : undefined;
        const hasReference =
          referenceValue !== undefined && referencePercent !== undefined;
        const aria = micronutrientAriaText(
          item.label,
          item.value,
          item.unit,
          referencePercent,
        );
        return (
          <div key={item.key} className="min-w-0 rounded-xl border bg-background/70 p-3">
            <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                {item.label}
              </span>
              {hasReference && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                  {formatReferencePercent(referencePercent!)}
                </span>
              )}
            </div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatMicronutrientAmount(item.value, item.unit)}</span>
              {hasReference ? (
                <span className="tabular-nums">
                  Günlük referans {formatMicronutrientAmount(referenceValue!, item.unit)}
                </span>
              ) : (
                <span>Günlük referans gösterilmiyor</span>
              )}
            </div>
            {hasReference && (
              <ProgressBar
                value={visualProgressPercent(referencePercent!)}
                ariaLabel={aria}
                ariaValueText={`${formatReferencePercent(referencePercent!)} günlük referans`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MicronutrientSummary({ refreshKey = 0 }: { refreshKey?: number }) {
  const [summary, setSummary] = React.useState<DailyMicronutrientSummaryDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const date = localDateKey();

    setLoading(true);
    setFailed(false);
    void mealsClient
      .getDailyMicronutrients(date, timezone)
      .then(({ summary: next }) => {
        if (active) setSummary(next);
      })
      .catch(() => {
        if (active) {
          setSummary(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  return (
    <Card className="overflow-hidden shadow-soft">
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-bold text-foreground">Vitamin ve Mineral Özeti</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Günlük beslenme kayıtlarındaki doğrulanmış besin değerlerine göre.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            Vitamin ve mineral özeti hazırlanıyor…
          </p>
        )}

        {!loading && failed && (
          <p className="text-sm text-muted-foreground">
            Vitamin ve mineral özeti şu anda yüklenemedi.
          </p>
        )}

        {!loading && !failed && summary && summary.nutrients.length === 0 && (
          <p className="rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {summary.note}
          </p>
        )}

        {!loading && !failed && summary && summary.nutrients.length > 0 && (
          <>
            <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              {summary.note}
            </p>
            <NutrientRows items={summary.nutrients.slice(0, 6)} />
            {summary.nutrients.length > 6 && (
              <details className="rounded-xl border">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-primary">
                  Tüm vitamin ve mineralleri göster ({summary.nutrients.length})
                </summary>
                <div className="border-t p-3">
                  <NutrientRows items={summary.nutrients.slice(6)} />
                </div>
              </details>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Günlük referans değerleri yetişkin besin referans alımını gösterir; tıbbi reçete veya laboratuvar tanısı değildir.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
