"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, Droplets, Plus, Utensils } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  dailyTrackingStore,
  WATER_GLASS_ML,
} from "@/application/health/daily-tracking-store";

/**
 * The first actionable block on the dashboard. A new user should understand
 * what to do in a few seconds: record food, record water, or ask the coach.
 */
export function TodayActionsSection() {
  const [addingWater, setAddingWater] = React.useState(false);

  const addWater = React.useCallback(async () => {
    if (addingWater) return;
    setAddingWater(true);
    try {
      await dailyTrackingStore.addWater();
      toast.success("Su eklendi", { description: `+${WATER_GLASS_ML} ml` });
    } catch {
      toast.error("Su eklenemedi. Lütfen tekrar dene.");
    } finally {
      setAddingWater(false);
    }
  }, [addingWater]);

  return (
    <section className="space-y-3" aria-labelledby="today-actions-heading">
      <div>
        <h2 id="today-actions-heading" className="text-lg font-bold">
          Bugün için 3 şey yeterli
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Takibini kolay tut. İhtiyacın olan yerden başla.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/meals/add" className="group block">
          <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
            <CardContent className="flex items-center gap-3 p-4 sm:flex-col sm:items-start">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Utensils className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Öğününü kaydet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Ne yediğini ekle</p>
              </div>
              <Plus className="ml-auto size-4 text-muted-foreground sm:hidden" aria-hidden="true" />
            </CardContent>
          </Card>
        </Link>

        <button
          type="button"
          onClick={() => void addWater()}
          disabled={addingWater}
          className="group text-left disabled:opacity-60"
        >
          <Card className="h-full transition-colors group-hover:border-sky-500/40 group-hover:bg-sky-500/[0.03]">
            <CardContent className="flex items-center gap-3 p-4 sm:flex-col sm:items-start">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
                <Droplets className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Suyunu takip et</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {addingWater ? "Ekleniyor…" : `+${WATER_GLASS_ML} ml su ekle`}
                </p>
              </div>
              <Plus className="ml-auto size-4 text-muted-foreground sm:hidden" aria-hidden="true" />
            </CardContent>
          </Card>
        </button>

        <Link href="/ai" className="group block">
          <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
            <CardContent className="flex items-center gap-3 p-4 sm:flex-col sm:items-start">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Koçuna danış</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Aklındakini sor</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </section>
  );
}
