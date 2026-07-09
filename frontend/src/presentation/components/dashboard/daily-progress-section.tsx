import { CircularProgress } from "@/presentation/components/ui/circular-progress";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { formatNumber, toPercent } from "@/shared/lib/format";

interface DailyProgressSectionProps {
  goal: number;
  consumed: number;
}

/** Large animated calorie ring with remaining calories and percentage. */
export function DailyProgressSection({ goal, consumed }: DailyProgressSectionProps) {
  const remaining = Math.max(0, goal - consumed);
  const percent = toPercent(consumed, goal);

  return (
    <Card className="shadow-soft">
      <CardContent className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:justify-between">
        <CircularProgress value={percent} size={188} strokeWidth={16}>
          <span className="text-4xl font-bold tabular-nums">{formatNumber(consumed)}</span>
          <span className="text-xs font-medium text-muted-foreground">
            / {formatNumber(goal)} kcal
          </span>
          <span className="mt-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
            %{percent}
          </span>
        </CircularProgress>

        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-1">
          <div className="rounded-xl bg-secondary p-3 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">Alınan</p>
            <p className="text-lg font-semibold tabular-nums">{formatNumber(consumed)} kcal</p>
          </div>
          <div className="rounded-xl bg-secondary p-3 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">Kalan</p>
            <p className="text-lg font-semibold tabular-nums text-primary">
              {formatNumber(remaining)} kcal
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
