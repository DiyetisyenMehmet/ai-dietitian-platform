import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";
import { NUTRITION_GOALS, type NutritionTotals } from "@/domain/meals/types";

interface NutritionSummaryProps {
  totals: NutritionTotals;
}

const MACRO_ROWS = [
  { key: "protein", label: "Protein", unit: "g", bar: "bg-emerald-500" },
  { key: "carbs", label: "Karbonhidrat", unit: "g", bar: "bg-amber-500" },
  { key: "fat", label: "Yağ", unit: "g", bar: "bg-sky-500" },
] as const;

/** Top-of-screen daily nutrition summary with animated progress bars. */
export function NutritionSummary({ totals }: NutritionSummaryProps) {
  const caloriePercent = toPercent(totals.calories, NUTRITION_GOALS.calories);

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-5 p-5">
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Toplam Kalori</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatNumber(totals.calories)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatNumber(NUTRITION_GOALS.calories)} kcal
                </span>
              </p>
            </div>
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              %{caloriePercent}
            </span>
          </div>
          <ProgressBar value={caloriePercent} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MACRO_ROWS.map((row) => {
            const value = totals[row.key];
            const goal = NUTRITION_GOALS[row.key];
            const percent = toPercent(value, goal);
            return (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(value)} / {formatNumber(goal)} {row.unit}
                  </span>
                </div>
                <ProgressBar value={percent} indicatorClassName={row.bar} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
