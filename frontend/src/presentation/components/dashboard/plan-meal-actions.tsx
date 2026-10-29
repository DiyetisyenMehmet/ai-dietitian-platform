"use client";

import type { PlanMealDecision, PlanMealState } from "@/application/health/plan-meal-decisions";

export function PlanMealActions({ decision, busy, change, different }: {
  decision?: PlanMealDecision; busy: boolean;
  change: (state: PlanMealState) => void; different: () => void;
}) {
  const style = "min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  return <div className="space-y-2" data-journey-meal-actions>
    <p className="text-xs text-muted-foreground" role="status">{!decision ? "Öğün kararı doğrulanıyor" : decision.state === "EATEN" ? "Yedim · Besin ve kalori kaydı ayrı" : decision.state === "SKIPPED" ? "Yemedim · Besin ve kalori eklenmedi" : "Henüz karar vermedin"}</p>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className={`${style} bg-primary text-primary-foreground`} disabled={busy || !decision || decision.state === "EATEN"} onClick={() => change("EATEN")}>Yedim</button>
      <button type="button" className={`${style} bg-card`} disabled={busy || !decision || decision.state === "SKIPPED"} onClick={() => change("SKIPPED")}>Yemedim</button>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={`${style} flex-1 bg-card`} disabled={busy || !decision} onClick={different}>Farklı yedim</button>
      {decision && decision.state !== "PENDING" && <button type="button" className={`${style} text-primary`} disabled={busy} onClick={() => change("PENDING")}>Kararı geri al</button>}
    </div>
  </div>;
}
