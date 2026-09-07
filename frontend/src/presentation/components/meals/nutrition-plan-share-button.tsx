"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

import type { DailyPlan } from "@/infrastructure/nutrition/nutrition-plan-client";
import { Button } from "@/presentation/components/ui/button";

interface ShareablePlanDay {
  dayNumber: number;
  dateLabel: string;
  day: DailyPlan;
}

interface NutritionPlanShareButtonProps {
  durationDays: number;
  days: ShareablePlanDay[];
}

interface NativeShareBridge {
  isAvailable(): boolean;
  shareText?(text: string, title: string): void;
}

function buildPlanText(durationDays: number, days: ShareablePlanDay[]): string {
  const lines = [
    `Diewish • ${durationDays} Günlük Öğün Planı`,
    "",
  ];

  for (const item of days) {
    lines.push(`${item.dayNumber}. Gün • ${item.dateLabel}`);
    for (const meal of item.day.meals) {
      lines.push(`${meal.time || "Saat belirtilmedi"} • ${meal.name}`);
      for (const food of meal.foods) {
        lines.push(`• ${food.name} — ${food.portion}`);
      }
    }
    lines.push(`Günlük toplam ~${Math.round(item.day.totalCalories)} kcal`);
    lines.push(
      `Protein ${Math.round(item.day.totalProteinGrams)} g • Karbonhidrat ${Math.round(item.day.totalCarbsGrams)} g • Yağ ${Math.round(item.day.totalFatGrams)} g`,
    );
    lines.push("");
  }

  lines.push("Yaklaşık besin değerleri içerir • Diewish");
  return lines.join("\n");
}

async function sharePlan(durationDays: number, days: ShareablePlanDay[]): Promise<"shared" | "copied" | "cancelled"> {
  const title = `Diewish • ${durationDays} Günlük Öğün Planı`;
  const text = buildPlanText(durationDays, days);
  const nativeShare = (window as Window & { DiewishShare?: NativeShareBridge }).DiewishShare;

  if (nativeShare?.isAvailable() && nativeShare.shareText) {
    nativeShare.shareText(text, title);
    return "shared";
  }

  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }

  await navigator.clipboard.writeText(text);
  return "copied";
}

export function NutritionPlanShareButton({ durationDays, days }: NutritionPlanShareButtonProps) {
  const [sharing, setSharing] = React.useState(false);

  const share = async () => {
    if (sharing || days.length === 0) return;
    setSharing(true);
    try {
      const result = await sharePlan(durationDays, days);
      if (result === "copied") {
        toast.success("Plan bu cihazda metin olarak panoya kopyalandı.");
      }
    } catch {
      toast.error("Öğün planı paylaşılamadı. Lütfen tekrar dene.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" isLoading={sharing} disabled={days.length === 0} onClick={() => void share()}>
      {!sharing && <Share2 aria-hidden="true" />}
      {sharing ? "Hazırlanıyor" : "Planı paylaş"}
    </Button>
  );
}
