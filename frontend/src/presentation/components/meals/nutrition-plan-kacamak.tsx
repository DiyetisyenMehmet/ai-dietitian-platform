"use client";

import * as React from "react";
import { Info, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import {
  nutritionPlanClient,
  type CreateNutritionPlanDeviationInput,
  type NutritionPlanDeviationRecord,
  type NutritionPlanDeviationType,
  type PlannedMeal,
} from "@/infrastructure/nutrition/nutrition-plan-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";

const OPTION_COPY: Record<
  NutritionPlanDeviationType,
  { label: string; help: string }
> = {
  SKIPPED: {
    label: "Yemedim",
    help: "Planlanan bu besini tüketmediğini belirtir.",
  },
  REPLACED: {
    label: "Değiştirdim",
    help: "Planlanan besin yerine başka bir besin tükettiğini belirtir.",
  },
  EXTRA: {
    label: "Fazla Kaçtı",
    help: "Planda olmayan ekstra bir yiyecek veya içecek tükettiğini belirtir.",
  },
  PORTION_CHANGED: {
    label: "Porsiyonu Değiştirdim",
    help: "Planlanan besini tükettiğini ancak miktarını değiştirdiğini belirtir.",
  },
};

const OPTION_ORDER: NutritionPlanDeviationType[] = [
  "SKIPPED",
  "REPLACED",
  "EXTRA",
  "PORTION_CHANGED",
];

function kacamakError(error: unknown): string {
  if (error instanceof ApiError && error.code === "SUBSCRIPTION_REQUIRED") {
    return "Kaçamak özelliği Premium ve Premium Plus kullanıcıları içindir.";
  }
  return "Kaçamak kaydedilemedi. Lütfen tekrar dene.";
}

function recordText(record: NutritionPlanDeviationRecord): string {
  const label = OPTION_COPY[record.type].label;
  if (record.type === "EXTRA") {
    return `${label}: ${record.actualItemName ?? "ekstra tüketim"}`;
  }
  if (record.type === "REPLACED") {
    return `${label}: ${record.plannedItemName ?? "besin"} → ${record.actualItemName ?? "alternatif"}`;
  }
  if (record.type === "PORTION_CHANGED") {
    return `${label}: ${record.plannedItemName ?? "besin"} → ${record.actualPortion ?? "farklı porsiyon"}`;
  }
  return `${label}: ${record.plannedItemName ?? "besin"}`;
}

export function useNutritionPlanDeviations(planId: string | null) {
  const [deviations, setDeviations] = React.useState<NutritionPlanDeviationRecord[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!planId) {
      setDeviations([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void nutritionPlanClient
      .listDeviations(planId)
      .then(({ deviations: next }) => {
        if (!cancelled) setDeviations(next);
      })
      .catch(() => {
        if (!cancelled) setDeviations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [planId]);

  const createDeviation = React.useCallback(
    async (input: CreateNutritionPlanDeviationInput) => {
      if (!planId) throw new Error("Nutrition plan is unavailable.");
      const { deviation } = await nutritionPlanClient.createDeviation(planId, input);
      setDeviations((current) => [deviation, ...current.filter((item) => item.id !== deviation.id)]);
      return deviation;
    },
    [planId],
  );

  const deleteDeviation = React.useCallback(
    async (deviationId: string) => {
      if (!planId) throw new Error("Nutrition plan is unavailable.");
      await nutritionPlanClient.deleteDeviation(planId, deviationId);
      setDeviations((current) => current.filter((item) => item.id !== deviationId));
    },
    [planId],
  );

  return { deviations, loading, createDeviation, deleteDeviation };
}

interface NutritionPlanKacamakProps {
  dayNumber: number;
  mealIndex: number;
  meal: PlannedMeal;
  deviations: NutritionPlanDeviationRecord[];
  deviationsLoading?: boolean;
  disabled?: boolean;
  onCreate(input: CreateNutritionPlanDeviationInput): Promise<NutritionPlanDeviationRecord>;
  onDelete(deviationId: string): Promise<void>;
}

export function NutritionPlanKacamak({
  dayNumber,
  mealIndex,
  meal,
  deviations,
  deviationsLoading = false,
  disabled = false,
  onCreate,
  onDelete,
}: NutritionPlanKacamakProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<NutritionPlanDeviationType | null>(null);
  const [infoType, setInfoType] = React.useState<NutritionPlanDeviationType | null>(null);
  const [foodIndex, setFoodIndex] = React.useState("");
  const [actualItemName, setActualItemName] = React.useState("");
  const [actualPortion, setActualPortion] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const mealDeviations = deviations.filter(
    (item) => item.dayNumber === dayNumber && item.mealIndex === mealIndex,
  );

  const resetForm = React.useCallback(() => {
    setSelectedType(null);
    setFoodIndex("");
    setActualItemName("");
    setActualPortion("");
    setNote("");
  }, []);

  const selectType = (type: NutritionPlanDeviationType) => {
    setSelectedType(type);
    setFoodIndex("");
    setActualItemName("");
    setActualPortion("");
    setNote("");
  };

  const needsPlannedFood = selectedType !== null && selectedType !== "EXTRA";
  const parsedFoodIndex = foodIndex === "" ? undefined : Number(foodIndex);
  const canSubmit =
    selectedType !== null &&
    (!needsPlannedFood || parsedFoodIndex !== undefined) &&
    (selectedType !== "REPLACED" || actualItemName.trim().length > 0) &&
    (selectedType !== "EXTRA" || actualItemName.trim().length > 0) &&
    (selectedType !== "PORTION_CHANGED" || actualPortion.trim().length > 0);

  const save = async () => {
    if (!selectedType || !canSubmit || saving) return;
    const input: CreateNutritionPlanDeviationInput = {
      dayNumber,
      mealIndex,
      scope: selectedType === "EXTRA" ? "MEAL" : "FOOD",
      type: selectedType,
    };

    if (selectedType !== "EXTRA" && parsedFoodIndex !== undefined) {
      input.foodIndex = parsedFoodIndex;
    }
    if (actualItemName.trim()) input.actualItemName = actualItemName.trim();
    if (actualPortion.trim()) input.actualPortion = actualPortion.trim();
    if (note.trim()) input.note = note.trim();

    setSaving(true);
    try {
      await onCreate(input);
      toast.success("Kaçamak kaydedildi. Planın devam ediyor.");
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(kacamakError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (deviationId: string) => {
    if (deletingId) return;
    setDeletingId(deviationId);
    try {
      await onDelete(deviationId);
      toast.success("Kaçamak kaydı kaldırıldı");
    } catch {
      toast.error("Kaçamak kaydı kaldırılamadı. Lütfen tekrar dene.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Kaçamak</p>
          <p className="text-[11px] text-muted-foreground">Premium ve Premium Plus</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || saving}
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
            if (open) resetForm();
          }}
        >
          {disabled ? "Gün başlamadı" : open ? "Kapat" : "Kaçamak ekle"}
        </Button>
      </div>

      {mealDeviations.length > 0 && (
        <div className="mt-3 space-y-2">
          {mealDeviations.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{recordText(record)}</p>
                {record.note && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{record.note}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deletingId === record.id}
                onClick={() => void remove(record.id)}
              >
                <Undo2 aria-hidden="true" />
                {deletingId === record.id ? "Kaldırılıyor" : "Geri al"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 rounded-2xl border border-border/70 bg-muted/25 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {OPTION_ORDER.map((type) => {
              const copy = OPTION_COPY[type];
              const selected = selectedType === type;
              return (
                <div key={type} className="rounded-xl border border-border/70 bg-background p-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                        selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                      onClick={() => selectType(type)}
                    >
                      {copy.label}
                    </button>
                    <button
                      type="button"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`${copy.label} hakkında bilgi`}
                      aria-expanded={infoType === type}
                      onClick={() => setInfoType((current) => (current === type ? null : type))}
                    >
                      <Info className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  {infoType === type && (
                    <p className="mt-2 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {copy.help}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {selectedType && (
            <div className="space-y-3 border-t border-border/70 pt-3">
              {needsPlannedFood && (
                <label className="block text-xs font-medium">
                  Hangi besin?
                  <select
                    className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={foodIndex}
                    onChange={(event) => setFoodIndex(event.target.value)}
                  >
                    <option value="">Besin seç</option>
                    {meal.foods.map((food, index) => (
                      <option key={`${food.name}-${index}`} value={index}>
                        {food.name} · {food.portion}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(selectedType === "REPLACED" || selectedType === "EXTRA") && (
                <label className="block text-xs font-medium">
                  {selectedType === "REPLACED" ? "Yerine ne yedin?" : "Ne fazla kaçtı?"}
                  <Input
                    className="mt-1.5"
                    value={actualItemName}
                    maxLength={120}
                    placeholder={selectedType === "REPLACED" ? "Örn. yoğurt" : "Örn. bir dilim pasta"}
                    onChange={(event) => setActualItemName(event.target.value)}
                  />
                </label>
              )}

              {(selectedType === "REPLACED" || selectedType === "EXTRA" || selectedType === "PORTION_CHANGED") && (
                <label className="block text-xs font-medium">
                  {selectedType === "PORTION_CHANGED" ? "Ne kadar tükettin?" : "Miktar (isteğe bağlı)"}
                  <Input
                    className="mt-1.5"
                    value={actualPortion}
                    maxLength={80}
                    placeholder="Örn. 2 dilim, 150 g"
                    onChange={(event) => setActualPortion(event.target.value)}
                  />
                </label>
              )}

              <label className="block text-xs font-medium">
                Not (isteğe bağlı)
                <Input
                  className="mt-1.5"
                  value={note}
                  maxLength={240}
                  placeholder="Örn. evde malzeme kalmamıştı"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Kaçamak kaydı planındaki öğünleri değiştirmez; yalnızca uyum geçmişine eklenir.
                </p>
                <Button type="button" size="sm" disabled={!canSubmit || saving} onClick={() => void save()}>
                  {saving ? "Kaydediliyor" : "Kaydet"}
                </Button>
              </div>
            </div>
          )}

          {deviationsLoading && (
            <p className="text-[11px] text-muted-foreground">Önceki Kaçamak kayıtları yükleniyor…</p>
          )}
        </div>
      )}
    </div>
  );
}
