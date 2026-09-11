"use client";

import * as React from "react";
import { Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import { foodScanClient, type FoodScanResultDto } from "@/infrastructure/tracking/food-scan-client";
import { Button } from "@/presentation/components/ui/button";
import { NutritionFactsGrid } from "./nutrition-scan-sections";

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Gıda adıyla analiz şu anda tamamlanamadı.";
}

function resolutionLabel(result: FoodScanResultDto): string {
  const resolution = result.nutritionResolution;
  if (!resolution) return result.disclaimer;
  if (resolution.method === "AI_ESTIMATE") {
    return `Diewish AI tahmini · güven yaklaşık %${Math.round(resolution.confidence * 100)}. ${resolution.note}`;
  }
  if (resolution.method === "COMPONENT_AGGREGATE") return resolution.note;
  if (resolution.method === "VERIFIED_SOURCE") return resolution.note;
  return resolution.note;
}

export function FoodNameFallbackPanel() {
  const [foodName, setFoodName] = React.useState("");
  const [grams, setGrams] = React.useState(100);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<FoodScanResultDto | null>(null);

  const analyze = React.useCallback(async () => {
    const name = foodName.trim();
    if (name.length < 2) {
      toast.error("Yemeğin veya gıdanın adını yaz.");
      return;
    }
    setLoading(true);
    try {
      const response = await foodScanClient.analyzeByName(name, grams);
      setResult(response.analysis);
    } catch (error) {
      toast.error("İsimle analiz tamamlanamadı", { description: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [foodName, grams]);

  return (
    <details className="rounded-2xl border bg-card p-4 shadow-sm">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        Fotoğrafta yemek adı netleşmediyse adını yazarak devam et
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">
        Diewish önce mevcut doğrulanmış besin kaynaklarını arar; sonuç yoksa açıkça etiketlenmiş AI tahmini yalnız son çare olarak kullanılır.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
        <input
          value={foodName}
          onChange={(event) => setFoodName(event.target.value)}
          placeholder="Örn. incir reçeli"
          maxLength={120}
          className="h-10 rounded-xl border bg-background px-3 text-sm"
          aria-label="Yemek veya gıda adı"
        />
        <div className="flex items-center rounded-xl border bg-background px-2">
          <input
            type="number"
            min={1}
            max={5000}
            value={grams}
            onChange={(event) => setGrams(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
            className="w-full bg-transparent text-sm outline-none"
            aria-label="Porsiyon gramı"
          />
          <span className="text-xs text-muted-foreground">g</span>
        </div>
        <Button onClick={() => void analyze()} isLoading={loading} disabled={loading}>
          {!loading && <Search className="size-4" />} Analiz et
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3 rounded-xl border p-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <p className="font-semibold">{result.dishName}</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{resolutionLabel(result)}</p>
          </div>
          <NutritionFactsGrid portion={result.totals} portionLabel={`${result.estimatedGrams ?? grams} g porsiyon`} />
          <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
        </div>
      )}
    </details>
  );
}
