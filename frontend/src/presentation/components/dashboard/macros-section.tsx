import { Card, CardContent } from "@/presentation/components/ui/card";
import { ProgressBar } from "@/presentation/components/ui/progress-bar";
import { formatNumber, toPercent } from "@/shared/lib/format";
import type { MacroNutrient } from "@/application/dashboard/dashboard-data";
import { cn } from "@/shared/lib/utils";

const MACRO_STYLES: Record<MacroNutrient["id"], string> = {
  protein: "bg-emerald-500",
  carbs: "bg-amber-500",
  fat: "bg-sky-500",
};

/** Three macro-nutrient cards with animated progress bars. */
export function MacrosSection({ macros }: { macros: MacroNutrient[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Makro Besinler</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {macros.map((macro) => {
          const percent = toPercent(macro.consumed, macro.goal);
          return (
            <Card key={macro.id}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{macro.label}</span>
                  <span className="text-xs font-semibold text-muted-foreground">%{percent}</span>
                </div>
                <p className="text-lg font-bold tabular-nums">
                  {formatNumber(macro.consumed)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {formatNumber(macro.goal)} {macro.unit}
                  </span>
                </p>
                <ProgressBar value={percent} indicatorClassName={cn(MACRO_STYLES[macro.id])} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
