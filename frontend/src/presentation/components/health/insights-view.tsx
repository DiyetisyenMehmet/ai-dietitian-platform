"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { useAiInsights } from "@/application/health/ai-insights";
import { AiInsightsPanel } from "@/presentation/components/health/ai-insights-panel";

/** The AI Insights hub — surfaces the coach's weekly/monthly reviews, risk
 *  alerts, nutrition adaptations, smart questions and memory summary. */
export function InsightsView() {
  const insights = useAiInsights();

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-[18px]" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Koçun İçgörüleri</h2>
            <p className="text-xs text-muted-foreground">
              Verilerine dayalı kişisel değerlendirmeler — tıbbi teşhis değil, güvenli rehberlik.
            </p>
          </div>
        </div>
      </section>

      <AiInsightsPanel insights={insights} />
    </div>
  );
}
