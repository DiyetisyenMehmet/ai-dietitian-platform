"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Plus, Clock, Utensils } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { formatNumber } from "@/shared/lib/format";
import { Card } from "@/presentation/components/ui/card";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/presentation/components/ui/modal";
import type { FoodItem, Meal } from "@/domain/meals/types";
import type { FoodWarning } from "@/domain/health/types";
import { mealsStore, mealTotals } from "@/application/meals/meals-store";
import { useHealthProfile } from "@/application/health/health-profile-store";
import { evaluateFoodWarnings } from "@/application/health/coach";
import { FoodWarningList } from "@/presentation/components/health/food-warning-list";
import { SLOT_ICON, SLOT_ACCENT } from "./meal-visuals";
import { FoodItemRow } from "./food-item-row";
import { EditFoodModal } from "./edit-food-modal";
import type { EditFoodInput } from "@/domain/meals/validation";

interface MealCardProps {
  meal: Meal;
  defaultOpen?: boolean;
}

/** Expandable meal card: summary header + food entries with edit/delete. */
export function MealCard({ meal, defaultOpen = false }: MealCardProps) {
  const [expanded, setExpanded] = React.useState(defaultOpen);
  const [editing, setEditing] = React.useState<FoodItem | null>(null);
  const [deleting, setDeleting] = React.useState<FoodItem | null>(null);

  const profile = useHealthProfile();
  const totals = mealTotals(meal);
  const Icon = SLOT_ICON[meal.slot];
  const foodCount = meal.foods.length;
  const contentId = `meal-panel-${meal.slot}`;

  const warnings = React.useMemo<FoodWarning[]>(() => {
    const byId = new Map<string, FoodWarning>();
    for (const food of meal.foods) {
      for (const warning of evaluateFoodWarnings(profile, food.name)) {
        if (!byId.has(warning.id)) byId.set(warning.id, warning);
      }
    }
    return Array.from(byId.values());
  }, [meal.foods, profile]);

  const handleEditSave = React.useCallback(
    (values: EditFoodInput) => {
      if (editing) mealsStore.updateFood(meal.slot, editing.id, values);
      setEditing(null);
    },
    [editing, meal.slot],
  );

  const handleDeleteConfirm = React.useCallback(() => {
    if (deleting) {
      mealsStore.deleteFood(meal.slot, deleting.id);
      toast.success("Besin silindi");
      setDeleting(null);
    }
  }, [deleting, meal.slot]);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-3.5 p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            SLOT_ACCENT[meal.slot],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{meal.label}</p>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" aria-hidden="true" />
              {meal.time}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatNumber(totals.calories)} kcal
            </span>
            <span>P {formatNumber(totals.protein)}g</span>
            <span>K {formatNumber(totals.carbs)}g</span>
            <span>Y {formatNumber(totals.fat)}g</span>
            <span>· {foodCount} besin</span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id={contentId} className="space-y-2 px-4 pb-4">
          <FoodWarningList warnings={warnings} className="mb-1" />
          {foodCount > 0 ? (
            meal.foods.map((food) => (
              <FoodItemRow key={food.id} food={food} onEdit={setEditing} onDelete={setDeleting} />
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-6 text-center">
              <Utensils className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Bu öğüne henüz besin eklenmedi</p>
            </div>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href={{ pathname: "/meals/add", query: { slot: meal.slot } }}>
              <Plus aria-hidden="true" />
              Besin Ekle
            </Link>
          </Button>
        </div>
      )}

      <EditFoodModal
        food={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleEditSave}
      />

      <Modal open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Besini sil</ModalTitle>
            <ModalDescription>
              &quot;{deleting?.name}&quot; kaydını silmek istediğinize emin misiniz? Bu işlem geri
              alınamaz.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              İptal
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Sil
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
}
