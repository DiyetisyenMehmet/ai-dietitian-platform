import { TrendingDown, TrendingUp, Scale } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";
import type { DashboardData } from "@/application/dashboard/dashboard-data";
import { cn } from "@/shared/lib/utils";

/** Current weight card with weekly change and a mini trend indicator. */
export function WeightSection({ weight }: { weight: DashboardData["weight"] }) {
  const losing = weight.weeklyChange <= 0;
  const TrendIcon = losing ? TrendingDown : TrendingUp;
  const changeAbs = Math.abs(weight.weeklyChange).toLocaleString("tr-TR");

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div className="flex items-center gap-3.5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
            <Scale className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Güncel Kilo</p>
            <p className="text-2xl font-bold tabular-nums">
              {weight.current.toLocaleString("tr-TR")}{" "}
              <span className="text-sm font-normal text-muted-foreground">{weight.unit}</span>
            </p>
          </div>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
            losing ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          <TrendIcon className="size-4" aria-hidden="true" />
          {changeAbs} {weight.unit}
          <span className="text-xs font-normal text-muted-foreground">/ hafta</span>
        </div>
      </CardContent>
    </Card>
  );
}
