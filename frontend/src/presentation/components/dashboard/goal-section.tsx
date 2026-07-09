import { Flame, Footprints, Droplets, Scale, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";
import type { GoalTarget } from "@/application/dashboard/dashboard-data";

const GOAL_ICONS: Record<string, LucideIcon> = {
  g1: Flame,
  g2: Footprints,
  g3: Droplets,
  g4: Scale,
};

/** Today's target card: calories, steps, water and weight. */
export function GoalSection({ goals }: { goals: GoalTarget[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Bugünkü Hedef</h3>
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {goals.map((goal) => {
            const Icon = GOAL_ICONS[goal.id] ?? Flame;
            const percent = toPercent(goal.current, goal.target);
            return (
              <div key={goal.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  <span className="text-sm font-medium">{goal.label}</span>
                </div>
                <p className="text-sm tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {formatNumber(goal.current)}
                  </span>{" "}
                  / {formatNumber(goal.target)} {goal.unit}
                </p>
                <ProgressBar value={percent} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
