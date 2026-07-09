import { Coffee, Sun, Moon, Cookie, Plus, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { formatNumber } from "@/shared/lib/format";
import type { MealEntry } from "@/application/dashboard/dashboard-data";

const SLOT_ICONS: Record<MealEntry["slot"], LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
};

/** Today's meals list. Entirely empty days show an elegant empty state. */
export function MealsSection({ meals }: { meals: MealEntry[] }) {
  const hasAnyMeal = meals.some((meal) => meal.title !== null);

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Bugünkü Öğünler</h3>

      {hasAnyMeal ? (
        <div className="grid gap-3">
          {meals.map((meal) => {
            const Icon = SLOT_ICONS[meal.slot];
            const logged = meal.title !== null;
            return (
              <Card key={meal.id}>
                <CardContent className="flex items-center gap-3.5 p-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <Icon className="size-5 text-accent-foreground" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">{meal.label}</p>
                    <p className="truncate text-sm font-semibold">
                      {logged ? meal.title : "Henüz eklenmedi"}
                    </p>
                  </div>
                  {logged ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatNumber(meal.calories ?? 0)} kcal
                    </span>
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                      <Plus className="size-4" aria-hidden="true" />
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-2">
            <EmptyState
              icon={Coffee}
              title="Bugün henüz öğün eklemediniz"
              description="Günlük beslenmenizi takip etmek için ilk öğününüzü ekleyin."
              action={{ label: "Öğün Ekle" }}
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
