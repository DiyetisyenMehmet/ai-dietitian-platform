"use client";

import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

import type { DailyPlan } from "@/infrastructure/nutrition/nutrition-plan-client";
import { shareNutritionPlanDay } from "@/presentation/components/meals/nutrition-plan-share-card";
import { Button } from "@/presentation/components/ui/button";

interface NutritionPlanDayShareButtonProps {
  dayNumber: number;
  dateLabel: string;
  day: DailyPlan;
}

export function NutritionPlanDayShareButton({
  dayNumber,
  dateLabel,
  day,
}: NutritionPlanDayShareButtonProps) {
  const [sharing, setSharing] = React.useState(false);

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareNutritionPlanDay({ dayNumber, dateLabel, day });
      if (result === "copied") {
        toast.success("Paylaşım bu cihazda metin olarak panoya kopyalandı.");
      }
    } catch {
      toast.error("Gün planı paylaşılamadı. Lütfen tekrar dene.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" isLoading={sharing} onClick={() => void share()}>
      {!sharing && <Share2 aria-hidden="true" />}
      {sharing ? "Hazırlanıyor" : "Günü paylaş"}
    </Button>
  );
}
