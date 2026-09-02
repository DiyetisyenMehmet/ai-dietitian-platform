"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Minus } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useHealthScore } from "@/application/health/health-score";

/**
 * Daily adherence control. It is explicitly framed as tracking consistency —
 * never as a medical "health score" — and expands to show every weighted input
 * so users can understand exactly where the number comes from.
 */
export function HealthScoreSection() {
  const health = useHealthScore();
  const [open, setOpen] = React.useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Günlük Uyum Skoru</h3>
          <p className="text-[11px] text-muted-foreground">Tıbbi değerlendirme değildir</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Minus className="size-3.5" aria-hidden="true" />
          Bugünkü kayıtlar
        </span>
      </div>

      <Card className="shadow-soft">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <CircularProgress value={health.score} size={104} strokeWidth={11}>
              <span className="text-2xl font-bold tabular-nums">{health.score}</span>
              <span className="text-[10px] font-medium text-muted-foreground">/ 100</span>
            </CircularProgress>

            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {health.band}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{health.reason}</p>
            </div>
          </div>

          {health.improvements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {health.improvements.map((imp) =>
                imp.href ? (
                  <Link
                    key={imp.label}
                    href={imp.href}
                    className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {imp.label}
                  </Link>
                ) : (
                  <span
                    key={imp.label}
                    className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium"
                  >
                    {imp.label}
                  </span>
                ),
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            {open ? "Ayrıntıları gizle" : "Skor nasıl hesaplanıyor?"}
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>

          {open && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Yalnızca bugün gerçekten kayıtlı ve hedefi tanımlı olan alanlar hesaba katılır.
                Kullanmadığın bir özellik puanını düşürmez.
              </p>
              <ul className="space-y-3">
                {health.factors.map((factor) => {
                  const Icon = healthIcon(factor.icon);
                  return (
                    <li key={factor.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          {factor.label}
                          <span className="text-muted-foreground">
                            · ağırlık %{Math.round(factor.weight * 100)}
                          </span>
                        </span>
                        <span className="tabular-nums font-semibold">{factor.value}</span>
                      </div>
                      <ProgressBar value={factor.value} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
