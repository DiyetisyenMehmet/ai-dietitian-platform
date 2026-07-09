"use client";

import { Pencil, Trash2 } from "lucide-react";

import { formatNumber } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import type { FoodItem } from "@/domain/meals/types";

interface FoodItemRowProps {
  food: FoodItem;
  onEdit: (food: FoodItem) => void;
  onDelete: (food: FoodItem) => void;
}

/** Single food entry row with macros and edit/delete actions. */
export function FoodItemRow({ food, onEdit, onDelete }: FoodItemRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{food.name}</p>
        <p className="text-xs text-muted-foreground">{food.quantity}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{formatNumber(food.calories)} kcal</span>
          <span>P {formatNumber(food.protein)}g</span>
          <span>K {formatNumber(food.carbs)}g</span>
          <span>Y {formatNumber(food.fat)}g</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={`${food.name} düzenle`}
          onClick={() => onEdit(food)}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-destructive hover:text-destructive"
          aria-label={`${food.name} sil`}
          onClick={() => onDelete(food)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
