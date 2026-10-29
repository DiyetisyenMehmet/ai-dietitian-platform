"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, History, ScanBarcode } from "lucide-react";

import { BarcodeScannerPanel } from "@/presentation/components/meals/barcode-scanner-panel";
import { FoodNameFallbackPanel } from "@/presentation/components/meals/food-name-fallback-panel";
import { FoodScannerView } from "@/presentation/components/meals/food-scanner-view";
import { useJourneyEntry } from "@/application/meals/journey-entry";

export function NutritionScannerView({ journeyToken }: { journeyToken?: string } = {}) {
  const journey = useJourneyEntry(journeyToken);
  const [mode, setMode] = React.useState<"photo" | "barcode">("photo");

  React.useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    if (requestedMode === "barcode") setMode("barcode");
  }, []);

  if (journey.loaded && journey.requested && (!journey.valid || journey.entry?.phase !== "open")) {
    return <div className="space-y-3" role="status" data-journey-scan-blocked>
      <p>Öğün bağlamı veya kayıt durumu doğrulanamadı. Yeniden kaydetmeden önce Beslenme kayıtlarını kontrol et.</p>
      <Link className="inline-flex min-h-11 items-center text-primary" href={journey.backHref}>Yolculuğuma dön</Link>
    </div>;
  }
  return (
    <div className="space-y-5">
      {journey.requested && <div className="space-y-2 rounded-xl border p-3" data-journey-scan-context>
        <p className="text-sm font-semibold">{journey.valid ? `${journey.meal?.meal.name} · ${journey.meal?.meal.time} · ${journey.entry?.day}` : "Öğün bağlamı doğrulanamadı"}</p>
        <p className="text-xs text-muted-foreground">Tarama besin veya Yedim kaydı oluşturmaz. Öğüne ekle için açık onayın gerekir; öğün kararını dönüşte ayrıca seç.</p>
        <Link className="inline-flex min-h-11 items-center text-primary" href={journey.backHref}>Yolculuğuma dön</Link>
      </div>}
      <div className="flex justify-end">
        <Link
          href={journey.requested ? `/meals/add?journey=${journey.token}` : "/meals/scan/history"}
          aria-label="Tarama geçmişini aç"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/50"
        >
          <History className="size-4 text-primary" aria-hidden="true" />
          {journey.requested ? "Besin formuna dön" : "Tarama geçmişi"}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1" role="tablist" aria-label="Besin tarama modu">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "photo"}
          onClick={() => setMode("photo")}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mode === "photo" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <Camera className="size-4" aria-hidden="true" /> Fotoğrafla Tara
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "barcode"}
          onClick={() => setMode("barcode")}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mode === "barcode" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <ScanBarcode className="size-4" aria-hidden="true" /> Barkod Tara
        </button>
      </div>

      {mode === "photo" ? (
        <div className="space-y-4">
          <FoodScannerView key={journeyToken ?? "default"} journeyToken={journeyToken} />
          <FoodNameFallbackPanel />
        </div>
      ) : <BarcodeScannerPanel key={journeyToken ?? "default"} journeyToken={journeyToken} />}
    </div>
  );
}
