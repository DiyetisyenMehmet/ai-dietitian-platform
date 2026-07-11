"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { goalFormSchema, type GoalFormInput } from "@/domain/goals/validation";
import { GOAL_TYPES, getGoalTypeMeta, type Goal } from "@/domain/goals/types";
import { goalsStore } from "@/application/goals/goals-store";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { FormField } from "@/presentation/components/ui/form-field";
import { Input } from "@/presentation/components/ui/input";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from "@/presentation/components/ui/modal";
import { GOAL_ICON, GOAL_ACCENT } from "./goal-visuals";

interface GoalFormProps {
  mode: "create" | "edit";
  /** Existing goal when editing. */
  goal?: Goal;
}

/** Returns today's date as an ISO YYYY-MM-DD string. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns an ISO date `days` from today. */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Create/Edit Goal form. React Hook Form + Zod validation, animated goal-type
 * picker, sticky mobile save bar, and an unsaved-changes guard (both the native
 * beforeunload prompt and an in-app confirmation on cancel).
 */
export function GoalForm({ mode, goal }: GoalFormProps) {
  const router = useRouter();
  const [showLeaveConfirm, setShowLeaveConfirm] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<GoalFormInput>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: goal
      ? {
          type: goal.type,
          title: goal.title,
          targetValue: goal.targetValue,
          startDate: goal.startDate,
          targetDate: goal.targetDate,
          reminderTime: goal.reminderTime ?? "",
          notes: goal.notes ?? "",
        }
      : {
          type: "lose-weight",
          title: "",
          targetValue: undefined as unknown as number,
          startDate: todayIso(),
          targetDate: isoFromToday(30),
          reminderTime: "",
          notes: "",
        },
  });

  const selectedType = watch("type");
  const activeMeta = getGoalTypeMeta(selectedType);

  // Native beforeunload guard while there are unsaved changes.
  React.useEffect(() => {
    if (!isDirty || isSubmitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isSubmitting]);

  const goBack = React.useCallback(() => {
    router.push(mode === "edit" && goal ? `/goals/${goal.id}` : "/goals");
  }, [router, mode, goal]);

  const handleCancel = React.useCallback(() => {
    if (isDirty) {
      setShowLeaveConfirm(true);
      return;
    }
    goBack();
  }, [isDirty, goBack]);

  const onSubmit = React.useCallback(
    async (values: GoalFormInput) => {
      // Simulate async persistence for realistic loading UX (no backend).
      await new Promise((resolve) => setTimeout(resolve, 600));

      const draft = {
        type: values.type,
        title: values.title ?? "",
        targetValue: values.targetValue,
        startDate: values.startDate,
        targetDate: values.targetDate,
        reminderTime: values.reminderTime || undefined,
        notes: values.notes || undefined,
      };

      if (mode === "edit" && goal) {
        goalsStore.update(goal.id, draft);
        toast.success("Hedef güncellendi");
        router.push(`/goals/${goal.id}`);
      } else {
        const created = goalsStore.create(draft);
        toast.success("Hedef oluşturuldu");
        router.push(`/goals/${created.id}`);
      }
    },
    [mode, goal, router],
  );

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Goal type picker */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold">Hedef Türü</h2>
              <p className="text-xs text-muted-foreground">Takip etmek istediğin hedefi seç.</p>
            </div>

            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GOAL_TYPES.map(({ type, label }) => {
                    const Icon = GOAL_ICON[type];
                    const active = field.value === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => field.onChange(type)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-accent/50",
                        )}
                        aria-pressed={active}
                      >
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg",
                            GOAL_ACCENT[type],
                          )}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.type?.message && (
              <p role="alert" className="text-sm text-destructive">
                {errors.type.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Goal details */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold">Hedef Detayları</h2>

            <FormField id="title" label="Başlık (opsiyonel)" error={errors.title?.message}>
              <Input placeholder={`örn. ${activeMeta.label} hedefim`} {...register("title")} />
            </FormField>

            <FormField
              id="targetValue"
              label={`Hedef Değer (${activeMeta.unit})`}
              error={errors.targetValue?.message}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                placeholder="örn. 75"
                {...register("targetValue", { valueAsNumber: true })}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField id="startDate" label="Başlangıç Tarihi" error={errors.startDate?.message}>
                <Input type="date" {...register("startDate")} />
              </FormField>
              <FormField id="targetDate" label="Hedef Tarihi" error={errors.targetDate?.message}>
                <Input type="date" {...register("targetDate")} />
              </FormField>
            </div>

            <FormField
              id="reminderTime"
              label="Hatırlatma Saati (opsiyonel)"
              error={errors.reminderTime?.message}
            >
              <Input type="time" {...register("reminderTime")} />
            </FormField>

            <FormField id="notes" label="Notlar (opsiyonel)" error={errors.notes?.message}>
              <textarea
                rows={3}
                placeholder="Hedefinle ilgili notların..."
                className={cn(
                  "flex w-full rounded-xl border border-input bg-background px-4 py-2.5 text-base transition-colors",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
                )}
                {...register("notes")}
              />
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
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              İptal
            </Button>
            <Button type="submit" className="flex-1" isLoading={isSubmitting}>
              {mode === "edit" ? "Değişiklikleri Kaydet" : "Hedefi Oluştur"}
            </Button>
          </div>
        </div>
      </form>

      {/* Unsaved changes confirmation */}
      <Modal open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Değişiklikler kaydedilmedi</ModalTitle>
            <ModalDescription>
              Kaydedilmemiş değişikliklerin var. Çıkarsan bu değişiklikler kaybolacak.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowLeaveConfirm(false)}>
              Düzenlemeye Devam Et
            </Button>
            <Button variant="destructive" onClick={goBack}>
              Çıkışı Onayla
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
