import { Footprints, Flame, Timer, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";
import { formatNumber } from "@/shared/lib/format";
import type { ActivityMetric } from "@/application/dashboard/dashboard-data";

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  a1: Footprints,
  a2: Flame,
  a3: Timer,
};

/** Activity summary: steps, calories burned and exercise minutes. */
export function ActivitySection({ activity }: { activity: ActivityMetric[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Aktivite Özeti</h3>
      <div className="grid grid-cols-3 gap-3">
        {activity.map((metric) => {
          const Icon = ACTIVITY_ICONS[metric.id] ?? Footprints;
          return (
            <Card key={metric.id}>
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent">
                  <Icon className="size-5 text-accent-foreground" aria-hidden="true" />
                </span>
                <p className="text-lg font-bold tabular-nums">{formatNumber(metric.value)}</p>
                <p className="text-[11px] font-medium leading-tight text-muted-foreground">
                  {metric.label}
                  {metric.unit ? ` (${metric.unit})` : ""}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
