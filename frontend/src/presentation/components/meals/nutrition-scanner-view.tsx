"use client";

import * as React from "react";
import { Camera, ScanBarcode } from "lucide-react";

import { BarcodeScannerPanel } from "@/presentation/components/meals/barcode-scanner-panel";
import { BrowserBarcodeScannerPanel } from "@/presentation/components/meals/browser-barcode-scanner-panel";
import { FoodScannerView } from "@/presentation/components/meals/food-scanner-view";

interface NativeScannerBridge {
  isAvailable(): boolean;
}

function hasNativeScannerBridge(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as unknown as { DiewishScanner?: NativeScannerBridge }).DiewishScanner;
  if (!bridge) return false;
  try {
    return bridge.isAvailable();
  } catch {
    return false;
  }
}

export function NutritionScannerView() {
  const [mode, setMode] = React.useState<"photo" | "barcode">("photo");
  const [nativeScanner, setNativeScanner] = React.useState(false);

  React.useEffect(() => {
    setNativeScanner(hasNativeScannerBridge());
  }, []);

  return (
    <div className="space-y-5">
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
        <FoodScannerView />
      ) : nativeScanner ? (
        <BarcodeScannerPanel />
      ) : (
        <BrowserBarcodeScannerPanel />
      )}
    </div>
  );
}
