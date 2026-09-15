"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Droplets, Footprints, Moon, Scale, Utensils } from "lucide-react";
import { toast } from "sonner";

import { dailyTrackingStore } from "@/application/health/daily-tracking-store";

const tileClass =
  "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 px-2 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Four primary one-tap actions from the approved dashboard, with legacy sleep access retained behind 'Tümünü Gör'. */
export function DashboardQuickActions() {
  const [showAll, setShowAll] = React.useState(false);
  const [addingWater, setAddingWater] = React.useState(false);

  const addWater = async () => {
    if (addingWater) return;
    setAddingWater(true);
    try {
      await dailyTrackingStore.addWater(250);
      toast.success("Su eklendi", { description: "+250 ml" });
    } catch (error) {
      toast.error("Su eklenemedi", {
        description: error instanceof Error ? error.message : "Lütfen tekrar dene.",
      });
    } finally {
      setAddingWater(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="dashboard-quick-actions-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="dashboard-quick-actions-heading" className="text-lg font-bold sm:text-xl">
          Bugün için hızlı işlemler
        </h2>
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? "Daha az" : "Tümünü Gör"}
          {showAll ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <Link href="/meals/add" className={`${tileClass} bg-emerald-500/[0.06]`}>
          <Utensils className="size-7 text-emerald-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-tight sm:text-sm">Öğün Ekle</span>
        </Link>
        <button
          type="button"
          disabled={addingWater}
          onClick={() => void addWater()}
          className={`${tileClass} bg-sky-500/[0.06] disabled:cursor-wait disabled:opacity-70`}
        >
          <Droplets className="size-7 text-sky-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-tight sm:text-sm">
            {addingWater ? "Ekleniyor…" : "Su Ekle"}
          </span>
        </button>
        <Link href="/activity" className={`${tileClass} bg-teal-500/[0.06]`}>
          <Footprints className="size-7 text-teal-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-tight sm:text-sm">Hareket Ekle</span>
        </Link>
        <Link href="/progress#weigh-in" className={`${tileClass} bg-violet-500/[0.06]`}>
          <Scale className="size-7 text-violet-500" aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-tight sm:text-sm">Kilo Ekle</span>
        </Link>
      </div>

      {showAll && (
        <div className="animate-fade-in">
          <Link
            href="/sleep"
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-indigo-500/[0.05] p-3 shadow-sm transition hover:border-indigo-500/30"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <Moon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Uyku kaydı</p>
              <p className="text-xs text-muted-foreground">Süre ve uyku kalitesini kaydet</p>
            </div>
          </Link>
        </div>
      )}
    </section>
  );
}
