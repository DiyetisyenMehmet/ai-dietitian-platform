import { Sparkles } from "lucide-react";

import type { DashboardData } from "@/application/dashboard/dashboard-data";

/** Single premium AI insight card (not chat). Uses placeholder content. */
export function AiInsightSection({ insight }: { insight: DashboardData["aiInsight"] }) {
  return (
    <section aria-label="Günlük içgörü">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-soft">
        <div className="flex items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 backdrop-blur">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {insight.title}
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                İpucu
              </span>
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{insight.message}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
