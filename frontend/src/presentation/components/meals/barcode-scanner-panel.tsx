"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, Heart, MessageCircle, RefreshCcw, Scale, Search, Square, TriangleAlert, Utensils } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import { nutritionClient, type CanonicalFoodDto, type ComparisonDto, type MealTypeDto, type PersonalizationDto } from "@/infrastructure/nutrition/nutrition-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

interface DetectedBarcode { rawValue: string; }
interface BarcodeDetectorInstance { detect(source: CanvasImageSource): Promise<DetectedBarcode[]>; }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const MEALS: readonly { value: MealTypeDto; label: string }[] = [
  { value: "BREAKFAST", label: "Kahvaltı" }, { value: "LUNCH", label: "Öğle" }, { value: "DINNER", label: "Akşam" }, { value: "SNACK", label: "Ara öğün" },
];

function detectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}
function nutrient(value: number | null, unit: string): string { return value === null ? "Bilgi yok" : `${Math.round(value * 10) / 10} ${unit}`; }
function defaultMealType(): MealTypeDto { const h = new Date().getHours(); return h < 11 ? "BREAKFAST" : h < 16 ? "LUNCH" : h < 22 ? "DINNER" : "SNACK"; }

export function BarcodeScannerPanel() {
  const [barcode, setBarcode] = React.useState("");
  const [food, setFood] = React.useState<CanonicalFoodDto | null>(null);
  const [grams, setGrams] = React.useState(100);
  const [personalization, setPersonalization] = React.useState<PersonalizationDto | null>(null);
  const [comparison, setComparison] = React.useState<ComparisonDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cameraActive, setCameraActive] = React.useState(false);
  const [personalizing, setPersonalizing] = React.useState(false);
  const [comparing, setComparing] = React.useState(false);
  const [mealType, setMealType] = React.useState<MealTypeDto>(() => defaultMealType());
  const [loggingMeal, setLoggingMeal] = React.useState(false);
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

  const loadPersonalization = React.useCallback(async (code: string, portionGrams: number) => {
    setPersonalizing(true);
    try {
      const result = await nutritionClient.personalize(code, portionGrams);
      setPersonalization(result.personalization);
    } catch {
      setPersonalization(null);
    } finally { setPersonalizing(false); }
  }, []);

  const lookup = React.useCallback(async (value: string) => {
    const normalized = value.replace(/\D/g, "");
    if (!normalized) return;
    setBarcode(normalized); setLoading(true); setFood(null); setNotFound(false); setPersonalization(null); setComparison(null);
    try {
      const result = await nutritionClient.barcode(normalized);
      setFood(result.food); setNotFound(!result.found);
      if (result.food) {
        const initialGrams = result.food.serving?.gramWeight && result.food.serving.gramWeight > 0 ? result.food.serving.gramWeight : 100;
        setGrams(initialGrams);
        void loadPersonalization(normalized, initialGrams);
      } else toast.message("Bu barkod için doğrulanmış ürün bilgisi bulunamadı.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Barkod sorgulanamadı.");
    } finally { setLoading(false); }
  }, [loadPersonalization]);

  const startCamera = React.useCallback(async () => {
    const Detector = detectorConstructor();
    if (!Detector) { toast.error("Bu cihazda yerleşik barkod çözme desteklenmiyor. Barkodu elle yazabilirsin."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; setCameraActive(true);
      const video = videoRef.current; if (!video) return;
      video.srcObject = stream; await video.play(); scanningRef.current = true;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const scan = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const hits = await detector.detect(videoRef.current);
          const code = hits.find((hit) => /^\d{6,14}$/.test(hit.rawValue))?.rawValue;
          if (code) { stopCamera(); void lookup(code); return; }
        } catch { /* transient frame error */ }
        timerRef.current = window.setTimeout(() => void scan(), 250);
      };
      void scan();
    } catch { stopCamera(); toast.error("Kamera açılamadı. İzni kontrol edebilir veya barkodu elle girebilirsin."); }
  }, [lookup, stopCamera]);

  const updatePortion = React.useCallback(async () => {
    if (!food?.barcode || !Number.isFinite(grams) || grams <= 0) return;
    await loadPersonalization(food.barcode, grams);
    setComparison(null);
  }, [food, grams, loadPersonalization]);

  const compare = React.useCallback(async () => {
    if (!food?.barcode) return;
    setComparing(true);
    try { setComparison((await nutritionClient.compare(food.barcode, grams)).comparison); }
    catch (error) { toast.error(error instanceof ApiError ? error.message : "Karşılaştırma yapılamadı."); }
    finally { setComparing(false); }
  }, [food, grams]);

  const logMeal = React.useCallback(async () => {
    if (!food || !personalization) return;
    setLoggingMeal(true);
    try { await nutritionClient.logMeal(mealType, food, personalization); toast.success("Öğüne eklendi."); }
    catch { toast.error("Öğüne eklenemedi."); }
    finally { setLoggingMeal(false); }
  }, [food, mealType, personalization]);

  const n = personalization?.nutrients ?? food?.nutrientsPer100g;

  return <div className="space-y-4">
    <Card><CardContent className="space-y-4 p-5">
      <div><h2 className="font-bold">Barkod Tara</h2><p className="text-sm text-muted-foreground">Barkod cihazında çözülür; sunucuya kamera görüntüsü değil yalnız barkod numarası gönderilir.</p></div>
      {cameraActive && <div className="overflow-hidden rounded-2xl border bg-black"><video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" /></div>}
      <div className="grid grid-cols-2 gap-2"><Button onClick={() => void startCamera()} disabled={cameraActive || loading}><Camera /> Kamerayı aç</Button><Button variant="outline" onClick={stopCamera} disabled={!cameraActive}><Square /> Durdur</Button></div>
      <div className="flex gap-2"><input value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0,14))} onKeyDown={(e) => { if (e.key === "Enter") void lookup(barcode); }} inputMode="numeric" placeholder="EAN / UPC barkod numarası" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" /><Button variant="outline" onClick={() => void lookup(barcode)} isLoading={loading} disabled={loading || barcode.length < 6}><Search /> Sorgula</Button></div>
    </CardContent></Card>

    {notFound && <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><TriangleAlert className="size-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Bilgi bulunamadı</p><p className="text-muted-foreground">Diewish eksik ürün değerlerini AI ile uydurmaz.</p></div></div>}

    {food && <Card><CardContent className="space-y-5 p-5">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">1. Bu ne?</p>
        <div className="mt-2 flex gap-4">{food.imageUrl ? <img src={food.imageUrl} alt={food.displayNameTr} className="size-24 rounded-2xl border object-contain" /> : <div className="size-24 rounded-2xl border bg-muted" />}<div><h3 className="text-lg font-bold">{food.displayNameTr || food.name}</h3>{food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}<p className="text-xs text-muted-foreground">{food.quantity ?? "Miktar bilgisi yok"} · {food.provider}</p><p className="text-xs tabular-nums text-muted-foreground">{food.barcode}</p></div></div>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">2. Besin değerleri</p>
        <div className="mt-2 flex items-center gap-2"><input type="number" min={1} max={5000} value={grams} onChange={(e) => setGrams(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} className="w-24 rounded-xl border px-3 py-2 text-sm" /><span className="text-sm">g</span><Button size="sm" variant="outline" onClick={() => void updatePortion()} isLoading={personalizing}><RefreshCcw /> Porsiyonu değiştir</Button></div>
        {n && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{[["Enerji", nutrient(n.energyKcal,"kcal")],["Protein",nutrient(n.proteinG,"g")],["Karbonhidrat",nutrient(n.carbohydratesG,"g")],["Yağ",nutrient(n.fatG,"g")],["Lif",nutrient(n.fiberG,"g")],["Şeker",nutrient(n.sugarsG,"g")],["Tuz",nutrient(n.saltG,"g")],["Sodyum",nutrient(n.sodiumMg,"mg")]].map(([l,v]) => <div key={l} className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{v}</p></div>)}</div>}
        <p className="mt-2 text-xs text-muted-foreground">Kaynak: {food.provider} · güven %{Math.round(food.provenance.confidence*100)} · Nutri-Score {food.nutriScore?.toUpperCase() ?? "yok"} · NOVA {food.novaGroup ?? "yok"}</p>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">3. Senin İçin</p>
        {!personalization && <p className="mt-2 text-sm text-muted-foreground">Aktif plan ve kayıtlı günlük durum varsa kişisel katkı burada gösterilir.</p>}
        {personalization?.metrics && <div className="mt-2 space-y-2">{personalization.metrics.lines.map((line) => <p key={line} className="rounded-xl bg-primary/5 p-3 text-sm">{line}</p>)}</div>}
        {personalization?.warnings.map((warning) => <div key={warning} className="mt-2 flex gap-2 rounded-xl border border-amber-500/30 p-3 text-sm"><TriangleAlert className="size-4 shrink-0 text-amber-600" />{warning}</div>)}
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">4. Ne yapabilirsin?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="flex gap-2"><select value={mealType} onChange={(e) => setMealType(e.target.value as MealTypeDto)} className="min-w-0 flex-1 rounded-xl border bg-background px-2 text-sm">{MEALS.map((m)=><option key={m.value} value={m.value}>{m.label}</option>)}</select><Button onClick={() => void logMeal()} isLoading={loggingMeal} disabled={!personalization}><Utensils /> Öğüne ekle</Button></div><Button variant="outline" onClick={() => void compare()} isLoading={comparing}><Scale /> Kalori karşılaştır</Button><Button variant="outline" onClick={() => void nutritionClient.setFavorite(food.barcode ?? barcode,true).then(()=>toast.success("Favorilere eklendi."))}><Heart /> Favorilere ekle</Button><Button asChild variant="outline"><Link href="/ai"><MessageCircle /> AI Koç&apos;a sor</Link></Button></div>
      </section>

      {(food.ingredients.length>0 || food.allergens.length>0) && <section className="text-sm"><p className="font-semibold">İçerik / alerjen</p>{food.ingredients.length>0 && <p className="text-muted-foreground">{food.ingredients.join(", ")}</p>}{food.allergens.length>0 && <p className="mt-1 text-amber-700">Alerjenler: {food.allergens.join(", ")}</p>}</section>}
    </CardContent></Card>}

    {comparison && <Card><CardContent className="space-y-3 p-5"><div><h3 className="font-bold">Aynı kaloride neler var?</h3><p className="text-xs text-muted-foreground">{comparison.warning}</p></div>{comparison.comparisons.length===0 ? <p className="text-sm text-muted-foreground">Güvenilir alternatif bulunamadı.</p> : comparison.comparisons.map((item)=><div key={`${item.food.provider}-${item.food.externalId}`} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><p className="font-semibold">{item.food.displayNameTr}</p><p className="font-semibold">~{Math.round(item.servingGrams)} g</p></div><p className="mt-1 text-xs text-muted-foreground">Protein {nutrient(item.nutrients.proteinG,"g")} · Lif {nutrient(item.nutrients.fiberG,"g")} · Şeker {nutrient(item.nutrients.sugarsG,"g")}</p><p className="text-xs text-muted-foreground">Tercih uyumu: {item.dietaryCompatibility === "COMPATIBLE" ? "uygun" : item.dietaryCompatibility === "INCOMPATIBLE" ? "uygun değil" : "doğrulanamadı"}{!item.allergenDataComplete ? " · alerjen verisi eksik olabilir" : ""}</p></div>)}</CardContent></Card>}
  </div>;
}
