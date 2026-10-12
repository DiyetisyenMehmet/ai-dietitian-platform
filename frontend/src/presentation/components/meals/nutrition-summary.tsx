import { Droplet, Dumbbell, Wheat } from "lucide-react";

import type { DailyDataReadiness } from "@/application/health/daily-data-readiness";
import type { NutritionTotals } from "@/domain/meals/types";
import { formatNumber } from "@/shared/lib/format";
import { Card } from "@/presentation/components/ui/card";

interface NutritionSummaryProps {
  totals: NutritionTotals;
  goals: Partial<NutritionTotals>;
  readiness: DailyDataReadiness;
}

const MACROS = [
  { key: "protein", label: "Protein", Icon: Dumbbell, color: "bg-sky-500", iconColor: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { key: "carbs", label: "Karbonhidrat", Icon: Wheat, color: "bg-amber-400", iconColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "fat", label: "Yağ", Icon: Droplet, color: "bg-pink-500", iconColor: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
] as const;

function safeAmount(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function validGoal(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function percentOf(value: number, goal: number): number {
  return Math.min(100, Math.max(0, (value / goal) * 100));
}

/** Real logged consumption and configured targets only; no fallback calorie goals. */
export function NutritionSummary({ totals, goals, readiness }: NutritionSummaryProps) {
  const known = readiness !== "UNKNOWN";
  const calories = known ? safeAmount(totals.calories) : null;
  const calorieGoal = validGoal(goals.calories);
  const hasProgress = calories !== null && calorieGoal !== null;
  const fraction = hasProgress ? percentOf(calories!, calorieGoal!) : 0;
  const remaining = hasProgress ? calorieGoal! - calories! : null;

  const headline = !known
    ? "Öğün kayıtların yükleniyor"
    : !calorieGoal
      ? "Günlük hedefin tanımlı değil"
      : calories === null
        ? "Kalori bilgisi gösterilemiyor"
        : calories > calorieGoal
          ? "Günlük hedefin aşıldı"
          : calories === calorieGoal
            ? "Günlük hedefine ulaştın"
            : "Günlük Hedefin Yolunda";

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden rounded-[1.65rem] border-border/60 bg-card shadow-soft">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 py-5 sm:gap-6 sm:p-6">
          <div
            className="mx-auto flex aspect-square w-full max-w-[184px] items-center justify-center rounded-full p-[13px]"
            style={{
              background: hasProgress
                ? "conic-gradient(#0ebca8 " + fraction + "%, #d9f5f0 " + fraction + "% 100%)"
                : "conic-gradient(#dcefeb 0% 100%)",
            }}
            role={hasProgress ? "progressbar" : undefined}
            aria-label={hasProgress ? "Günlük kalori hedefi" : undefined}
            aria-valuemin={hasProgress ? 0 : undefined}
            aria-valuemax={hasProgress ? 100 : undefined}
            aria-valuenow={hasProgress ? Math.round(fraction) : undefined}
            aria-valuetext={hasProgress ? formatNumber(calories!) + " / " + formatNumber(calorieGoal!) + " kcal" : undefined}
          >
            <div className="flex h-full w-full min-w-0 flex-col items-center justify-center rounded-full bg-card px-1 text-center">
              <span className="max-w-full truncate text-[clamp(1.2rem,5vw,2rem)] font-extrabold tabular-nums tracking-tight text-foreground">
                {calories === null ? "—" : formatNumber(calories)}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground sm:text-sm">
                {calorieGoal !== null ? "/ " + formatNumber(calorieGoal) + " kcal" : "kcal"}
              </span>
              <span className="mt-2 text-[10px] font-medium leading-tight text-muted-foreground sm:text-xs">
                {remaining !== null
                  ? remaining >= 0
                    ? formatNumber(remaining) + " kcal kaldı"
                    : formatNumber(Math.abs(remaining)) + " kcal aşıldı"
                  : known ? "Hedef bilgisi yok" : "Yükleniyor"}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-[clamp(0.95rem,3.9vw,1.4rem)] font-extrabold leading-tight tracking-tight text-teal-600 dark:text-teal-300">
              {headline}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {!known
                ? "Gerçek tüketim verilerin alındığında özet güncellenecek."
                : calorieGoal === null
                  ? "Hedefini profilinden belirlediğinde ilerlemen burada görünür."
                  : "Özetin, kaydettiğin öğünlere ve tanımlı hedeflerine göre hesaplanır."}
            </p>
          </div>
        </div>
      </Card>

      <Card className="rounded-[1.5rem] border-border/60 shadow-soft">
        <div className="grid grid-cols-3 divide-x divide-border/60 px-1 py-4 sm:px-3">
          {MACROS.map(({ key, label, Icon, color, iconColor }) => {
            const value = known ? safeAmount(totals[key]) : null;
            const goal = validGoal(goals[key]);
            const hasMacroProgress = value !== null && goal !== null;
            const progress = hasMacroProgress ? percentOf(value!, goal!) : 0;
            return (
              <div key={key} className="min-w-0 space-y-2 px-2 sm:px-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={"flex size-8 shrink-0 items-center justify-center rounded-xl " + iconColor}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-[11px] font-semibold leading-tight sm:text-xs">{label}</p>
                    <p className="text-xs font-bold tabular-nums text-foreground sm:text-sm">
                      {hasMacroProgress ? "%" + Math.round((value! / goal!) * 100) : "—"}
                    </p>
                  </div>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role={hasMacroProgress ? "progressbar" : undefined}
                  aria-label={hasMacroProgress ? label + " hedefi" : undefined}
                  aria-valuemin={hasMacroProgress ? 0 : undefined}
                  aria-valuemax={hasMacroProgress ? 100 : undefined}
                  aria-valuenow={hasMacroProgress ? Math.round(progress) : undefined}
                >
                  <div className={"h-full rounded-full " + color} style={{ width: progress + "%" }} />
                </div>
                <p className="break-words text-[10px] leading-tight text-muted-foreground sm:text-xs">
                  {value === null ? "Veri bekleniyor" : formatNumber(value) + " g"}
                  {goal !== null ? " / " + formatNumber(goal) + " g" : ""}
                </p>
                {goal === null && known && <p className="text-[10px] text-muted-foreground">Hedef tanımlı değil</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
