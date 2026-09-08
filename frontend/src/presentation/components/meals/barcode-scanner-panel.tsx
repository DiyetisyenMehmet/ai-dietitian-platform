"use client";

import * as React from "react";
import { Camera, Heart, ScanBarcode, Search, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { nutritionClient, type CanonicalFoodDto } from "@/infrastructure/nutrition/nutrition-client";
import { ApiError } from "@/infrastructure/api/http-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function detectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

function nutrient(value: number | null, unit: string): string {
  if (value === null) return "Bilgi yok";
  return `${Math.round(value * 10) / 10} ${unit}`;
}

function providerLabel(provider: CanonicalFoodDto["provider"]): string {
  if (provider === "OPEN_FOOD_FACTS") return "Open Food Facts";
  if (provider === "USDA") return "USDA FoodData Central";
  return "Diewish";
}

function ProductResult({ food, onFavorite }: { food: CanonicalFoodDto; onFavorite: () => void }) {
  const n = food.nutrientsPer100g;
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex gap-4">
          {food.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={food.imageUrl} alt={food.displayNameTr} className="size-24 rounded-2xl border object-contain" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
              <ScanBarcode className="size-8" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Bu ne?</p>
            <h3 className="mt-1 text-lg font-bold">{food.displayNameTr || food.name}</h3>
            {food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}
            {food.quantity && <p className="text-xs text-muted-foreground">Net miktar: {food.quantity}</p>}
            {food.barcode && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{food.barcode}</p>}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Besin değerleri</p>
          <p className="mt-1 text-xs text-muted-foreground">100 g / 100 ml bazında, kaynakta mevcut olduğu ölçüde.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {[
              ["Enerji", nutrient(n.energyKcal, "kcal")],
              ["Protein", nutrient(n.proteinG, "g")],
              ["Karbonhidrat", nutrient(n.carbohydratesG, "g")],
              ["Yağ", nutrient(n.fatG, "g")],
              ["Doymuş yağ", nutrient(n.saturatedFatG, "g")],
              ["Şeker", nutrient(n.sugarsG, "g")],
              ["Lif", nutrient(n.fiberG, "g")],
              ["Tuz", nutrient(n.saltG, "g")],
              ["Sodyum", nutrient(n.sodiumMg, "mg")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="font-semibold">Ürün bilgisi</p>
            <p className="mt-1 text-xs text-muted-foreground">Nutri-Score: {food.nutriScore?.toUpperCase() ?? "Bilgi yok"}</p>
            <p className="text-xs text-muted-foreground">NOVA: {food.novaGroup ?? "Bilgi yok"}</p>
            <p className="text-xs text-muted-foreground">Vegan: {food.vegan === null ? "Belirsiz" : food.vegan ? "Evet" : "Hayır"}</p>
            <p className="text-xs text-muted-foreground">Vejetaryen: {food.vegetarian === null ? "Belirsiz" : food.vegetarian ? "Evet" : "Hayır"}</p>
            <p className="text-xs text-muted-foreground">Glutensiz: {food.glutenFree === null ? "Belirsiz" : food.glutenFree ? "Evet" : "Hayır"}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="font-semibold">Kaynak</p>
            <p className="mt-1 text-xs text-muted-foreground">{providerLabel(food.provider)}</p>
            <p className="text-xs text-muted-foreground">Güven: %{Math.round(food.provenance.confidence * 100)}</p>
            <p className="text-xs text-muted-foreground">Alınma: {new Date(food.provenance.retrievedAt).toLocaleDateString("tr-TR")}</p>
          </div>
        </div>

        {(food.ingredients.length > 0 || food.allergens.length > 0 || food.additives.length > 0) && (
          <div className="space-y-3 text-sm">
            {food.ingredients.length > 0 && <div><p className="font-semibold">İçindekiler</p><p className="text-muted-foreground">{food.ingredients.join(", ")}</p></div>}
            {food.allergens.length > 0 && <div><p className="font-semibold">Alerjenler</p><p className="text-muted-foreground">{food.allergens.join(", ")}</p></div>}
            {food.additives.length > 0 && <div><p className="font-semibold">Katkı maddeleri</p><p className="text-muted-foreground">{food.additives.join(", ")}</p></div>}
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={onFavorite}>
          <Heart aria-hidden="true" /> Favorilere ekle
        </Button>
      </CardContent>
    </Card>
  );
}

export function BarcodeScannerPanel() {
  const [barcode, setBarcode] = React.useState("");
  const [food, setFood] = React.useState<CanonicalFoodDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cameraActive, setCameraActive] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const scanningRef = React.useRef(false);

  const stopCamera = React.useCallback(() => {
    scanningRef.current = false;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  const lookup = React.useCallback(async (value: string) => {
    const normalized = value.replace(/\D/g, "");
    if (!normalized) return;
    setBarcode(normalized);
    setLoading(true);
    setFood(null);
    setNotFound(false);
    try {
      const result = await nutritionClient.barcode(normalized);
      setFood(result.food);
      setNotFound(!result.found);
      if (!result.found) toast.message("Bu barkod için doğrulanmış ürün bilgisi bulunamadı.");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Barkod sorgulanamadı.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const startCamera = React.useCallback(async () => {
    const Detector = detectorConstructor();
    if (!Detector) {
      toast.error("Bu cihazın tarayıcısı yerleşik barkod çözmeyi desteklemiyor. Barkodu elle yazabilirsin.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      scanningRef.current = true;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });

      const scan = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const hits = await detector.detect(videoRef.current);
          const value = hits.find((hit) => /^\d{6,14}$/.test(hit.rawValue))?.rawValue;
          if (value) {
            stopCamera();
            void lookup(value);
            return;
          }
        } catch {
          // A transient detector frame failure should not tear down the camera.
        }
        timerRef.current = window.setTimeout(() => void scan(), 250);
      };
      void scan();
    } catch {
      stopCamera();
      toast.error("Kamera açılamadı. Kamera iznini kontrol edebilir veya barkodu elle girebilirsin.");
    }
  }, [lookup, stopCamera]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ScanBarcode className="size-6" /></span>
            <div>
              <h2 className="font-bold">Barkod Tara</h2>
              <p className="text-sm text-muted-foreground">Barkod mümkünse cihazında çözülür; sunucuya kamera görüntüsü değil yalnız barkod numarası gönderilir.</p>
            </div>
          </div>

          {cameraActive && (
            <div className="overflow-hidden rounded-2xl border bg-black">
              <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void startCamera()} disabled={cameraActive || loading}><Camera /> Kamerayı aç</Button>
            <Button variant="outline" onClick={stopCamera} disabled={!cameraActive}><Square /> Durdur</Button>
          </div>

          <div className="flex gap-2">
            <input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value.replace(/\D/g, "").slice(0, 14))}
              onKeyDown={(event) => { if (event.key === "Enter") void lookup(barcode); }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="EAN / UPC barkod numarası"
              className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button variant="outline" onClick={() => void lookup(barcode)} isLoading={loading} disabled={loading || barcode.length < 6}><Search /> Sorgula</Button>
          </div>
        </CardContent>
      </Card>

      {notFound && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div><p className="font-semibold">Bilgi bulunamadı</p><p className="text-muted-foreground">Diewish eksik ürün değerlerini AI ile uydurmaz. Ürün daha sonra veri kaynaklarına eklendiğinde tekrar tarayabilirsin.</p></div>
        </div>
      )}

      {food && <ProductResult food={food} onFavorite={() => void nutritionClient.setFavorite(food.barcode ?? barcode, true).then(() => toast.success("Favorilere eklendi.")).catch(() => toast.error("Favoriye eklenemedi."))} />}
    </div>
  );
}
