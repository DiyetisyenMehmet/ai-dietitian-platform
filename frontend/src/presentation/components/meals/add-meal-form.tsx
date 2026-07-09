"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { addMealSchema, type AddMealInput } from "@/domain/meals/validation";
import { MEAL_SLOTS, type MealSlot } from "@/domain/meals/types";
import { mealsStore } from "@/application/meals/meals-store";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { Button } from "@/presentation/components/ui/button";
import { SLOT_ICON } from "./meal-visuals";
import { MealSearch } from "./meal-search";

interface AddMealFormProps {
  initialSlot?: MealSlot;
}

const DEFAULT_TIME: Record<MealSlot, string> = {
  breakfast: "08:00",
  lunch: "13:00",
  dinner: "19:00",
  snack: "16:00",
};

/** Add Meal form: search + manual entry, meal type, time, validation and toasts. */
export function AddMealForm({ initialSlot = "breakfast" }: AddMealFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddMealInput>({
    resolver: zodResolver(addMealSchema),
    defaultValues: {
      name: "",
      quantity: "",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mealSlot: initialSlot,
      time: DEFAULT_TIME[initialSlot],
    },
  });

  const onSubmit = React.useCallback(
    async (values: AddMealInput) => {
      // Simulate async persistence for realistic loading UX (no backend).
      await new Promise((resolve) => setTimeout(resolve, 600));
      mealsStore.addFood({
        slot: values.mealSlot,
        time: values.time,
        food: {
          name: values.name,
          quantity: values.quantity,
          calories: values.calories,
          protein: values.protein,
          carbs: values.carbs,
          fat: values.fat,
        },
      });
      toast.success("Besin öğüne eklendi");
      router.push("/meals");
    },
    [router],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Besin Ara</h2>
            <p className="text-xs text-muted-foreground">
              Kataloqdan seçin veya aşağıdan manuel girin.
            </p>
          </div>
          <MealSearch
            onSelect={(food) => {
              setValue("name", food.name, { shouldValidate: true });
              setValue("quantity", food.serving, { shouldValidate: true });
              setValue("calories", food.calories, { shouldValidate: true });
              setValue("protein", food.protein, { shouldValidate: true });
              setValue("carbs", food.carbs, { shouldValidate: true });
              setValue("fat", food.fat, { shouldValidate: true });
              toast.success(`${food.name} forma eklendi`);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Besin Bilgileri</h2>

          <FormField id="name" label="Besin Adı" error={errors.name?.message}>
            <Input placeholder="örn. Izgara Tavuk" {...register("name")} />
          </FormField>

          <FormField id="quantity" label="Miktar" error={errors.quantity?.message}>
            <Input placeholder="örn. 100 g, 1 porsiyon" {...register("quantity")} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="calories" label="Kalori (kcal)" error={errors.calories?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("calories", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="protein" label="Protein (g)" error={errors.protein?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("protein", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="carbs" label="Karbonhidrat (g)" error={errors.carbs?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("carbs", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="fat" label="Yağ (g)" error={errors.fat?.message}>
              <Input
                type="number"
                inputMode="numeric"
                {...register("fat", { valueAsNumber: true })}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Öğün ve Zaman</h2>

          <Controller
            control={control}
            name="mealSlot"
            render={({ field }) => (
              <div>
                <p className="mb-1.5 text-sm font-medium">Öğün Türü</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MEAL_SLOTS.map(({ slot, label }) => {
                    const Icon = SLOT_ICON[slot];
                    const active = field.value === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          field.onChange(slot);
                          setValue("time", DEFAULT_TIME[slot]);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-accent/50",
                        )}
                        aria-pressed={active}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {errors.mealSlot?.message && (
                  <p role="alert" className="mt-1.5 text-sm text-destructive">
                    {errors.mealSlot.message}
                  </p>
                )}
              </div>
            )}
          />

          <FormField id="time" label="Saat" error={errors.time?.message}>
            <Input type="time" {...register("time")} />
          </FormField>
        </CardContent>
      </Card>

      {/* Sticky action bar — stays visible above the mobile keyboard. */}
      <div className="sticky bottom-0 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/meals")}
            disabled={isSubmitting}
          >
            İptal
          </Button>
          <Button type="submit" className="flex-1" isLoading={isSubmitting}>
            Kaydet
          </Button>
        </div>
      </div>
    </form>
  );
}
