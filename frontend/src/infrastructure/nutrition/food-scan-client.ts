import { apiRequest } from "@/infrastructure/api/http-client";

export interface FoodScanItemDto {
  name: string;
  estimatedPortion: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface FoodScanTotalsDto {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface FoodScanResultDto {
  isFood: boolean;
  confidence: number;
  reason: string;
  items: FoodScanItemDto[];
  totals: FoodScanTotalsDto | null;
  disclaimer: string;
}

/** Thin transport client for authenticated, non-persistent food-image analysis. */
export const foodScanClient = {
  analyze(file: File) {
    const form = new FormData();
    form.append("file", file, file.name);
    return apiRequest<{ analysis: FoodScanResultDto }>({
      path: "/food-scan/analyze",
      method: "POST",
      auth: true,
      body: form,
    });
  },
} as const;
