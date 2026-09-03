"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { editFoodSchema, type EditFoodInput } from "@/domain/meals/validation";
import type { FoodItem } from "@/domain/meals/types";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/presentation/components/ui/modal";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { Button } from "@/presentation/components/ui/button";

interface EditFoodModalProps {
  food: FoodItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: EditFoodInput) => Promise<void>;
}

/** Modal form for editing a persisted food entry with real loading/error state. */
export function EditFoodModal({ food, open, onOpenChange, onSave }: EditFoodModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFoodInput>({
    resolver: zodResolver(editFoodSchema),
  });

  React.useEffect(() => {
    if (food) {
      reset({
        name: food.name,
        quantity: food.quantity,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      });
    }
  }, [food, reset]);

  const onSubmit = React.useCallback(
    async (values: EditFoodInput) => {
      try {
        await onSave(values);
        toast.success("Besin güncellendi");
        onOpenChange(false);
      } catch {
        toast.error("Besin güncellenemedi. Lütfen tekrar dene.");
      }
    },
    [onSave, onOpenChange],
  );

  return (
    <Modal open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Besini Düzenle</ModalTitle>
          <ModalDescription>Miktar ve besin değerlerini güncelleyin.</ModalDescription>
        </ModalHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField id="edit-name" label="Besin Adı" error={errors.name?.message}>
            <Input {...register("name")} />
          </FormField>
          <FormField id="edit-quantity" label="Miktar" error={errors.quantity?.message}>
            <Input placeholder="örn. 100 g" {...register("quantity")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="edit-calories" label="Kalori (kcal)" error={errors.calories?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("calories", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="edit-protein" label="Protein (g)" error={errors.protein?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("protein", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="edit-carbs" label="Karbonhidrat (g)" error={errors.carbs?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("carbs", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="edit-fat" label="Yağ (g)" error={errors.fat?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("fat", { valueAsNumber: true })}
              />
            </FormField>
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Kaydet
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
