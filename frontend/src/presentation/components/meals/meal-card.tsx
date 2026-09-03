"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Plus, Clock, Utensils } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { formatNumber } from "@/shared/lib/format";
import { Card } from "@/presentation/components/ui/card";
import { Button } from "@/presentation/components/ui/button";
import { Checkbox } from "@/presentation/components/ui/checkbox";
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

/**
 * Expandable meal card with an independent persisted "Yedim" check-in. The
 * check-in is deliberately separate from food items: it records adherence
 * without fabricating nutrition values and can be undone without deleting food.
 */
export function MealCard({ meal, defaultOpen = false }: MealCardProps) {
  const [expanded, setExpanded] = React.useState(defaultOpen);
  const [editing, setEditing] = React.useState<FoodItem | null>(null);
  const [deleting, setDeleting] = React.useState<FoodItem | null>(null);
  const [checkPending, setCheckPending] = React.useState(false);
  const [deletePending, setDeletePending] = React.useState(false);

  const profile = useHealthProfile();
  const totals = mealTotals(meal);
  const Icon = SLOT_ICON[meal.slot];
  const foodCount = meal.foods.length;
  const contentId = `meal-panel-${meal.slot}`;
  const checkboxId = `meal-eaten-${meal.slot}`;

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

  const handleMealCheck = React.useCallback(
    async (checked: boolean) => {
      if (checkPending || checked === meal.isEaten) return;
      setCheckPending(true);
      try {
        if (checked) {
          await mealsStore.markMealEaten(meal.slot);
          toast.success(`${meal.label} tamamlandı`);
        } else {
          await mealsStore.unmarkMealEaten(meal.slot);
          toast.success(`${meal.label} işareti kaldırıldı`);
        }
      } catch {
        toast.error("Öğün durumu kaydedilemedi. Lütfen tekrar dene.");
      } finally {
        setCheckPending(false);
      }
    },
    [checkPending, meal.isEaten, meal.label, meal.slot],
  );

  const handleDeleteConfirm = React.useCallback(async () => {
    if (!deleting || deletePending) return;
    setDeletePending(true);
    try {
      await mealsStore.deleteFood(meal.slot, deleting.id);
      toast.success("Besin silindi");
      setDeleting(null);
    } catch {
      toast.error("Besin silinemedi. Lütfen tekrar dene.");
    } finally {
      setDeletePending(false);
    }
  }, [deleting, deletePending, meal.slot]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="flex min-w-0 flex-1 items-center gap-3.5 p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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

        <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-l px-3 py-2">
          <Checkbox
            id={checkboxId}
            checked={meal.isEaten}
            disabled={checkPending}
            onCheckedChange={(value) => void handleMealCheck(value === true)}
            aria-label={`${meal.label} öğününü yedim`}
          />
          <label
            htmlFor={checkboxId}
            className={cn(
              "cursor-pointer select-none text-[11px] font-medium",
              meal.isEaten ? "text-primary" : "text-muted-foreground",
              checkPending && "cursor-wait opacity-60",
            )}
          >
            {checkPending ? "Kaydediliyor" : meal.isEaten ? "Yedim ✓" : "Yedim"}
          </label>
        </div>
      </div>

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
              <p className="text-xs text-muted-foreground">
                Sadece öğünü yaptığını işaretleyebilir veya yediklerini ayrıca ekleyebilirsin.
              </p>
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

      <Modal open={deleting !== null} onOpenChange={(open) => !open && !deletePending && setDeleting(null)}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Besini sil</ModalTitle>
            <ModalDescription>
              &quot;{deleting?.name}&quot; kaydını silmek istediğinize emin misiniz? Bu işlem geri
              alınamaz.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" disabled={deletePending} onClick={() => setDeleting(null)}>
              İptal
            </Button>
            <Button variant="destructive" disabled={deletePending} onClick={() => void handleDeleteConfirm()}>
              {deletePending ? "Siliniyor…" : "Sil"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
}
