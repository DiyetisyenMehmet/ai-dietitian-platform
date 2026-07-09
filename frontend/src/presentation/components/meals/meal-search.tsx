"use client";

import * as React from "react";
import { Search, X, Plus } from "lucide-react";

import { Input } from "@/presentation/components/ui/input";
import { formatNumber } from "@/shared/lib/format";
import { FOOD_CATALOG } from "@/application/meals/food-catalog";
import type { FoodCatalogItem } from "@/domain/meals/types";

interface MealSearchProps {
  onSelect: (food: FoodCatalogItem) => void;
}

/** Fast client-side food search over the placeholder catalog. */
export function MealSearch({ onSelect }: MealSearchProps) {
  const [query, setQuery] = React.useState("");

  const results = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return [];
    return FOOD_CATALOG.filter((f) => f.name.toLocaleLowerCase("tr-TR").includes(q)).slice(0, 6);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Besin ara (örn. yumurta, tavuk...)"
          aria-label="Besin ara"
          className="pl-10 pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Aramayı temizle"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {query.trim() && (
        <div className="overflow-hidden rounded-xl border border-border">
          {results.length > 0 ? (
            <ul className="divide-y divide-border">
              {results.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(food);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{food.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {food.serving} · {formatNumber(food.calories)} kcal
                      </p>
                    </div>
                    <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              &quot;{query}&quot; için sonuç bulunamadı. Aşağıdan manuel ekleyebilirsiniz.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
