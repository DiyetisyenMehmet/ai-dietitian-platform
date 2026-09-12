"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, Heart, MessageCircle, RefreshCcw, Scale, Search, Square, TriangleAlert, Utensils } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import { nutritionClient, type CanonicalFoodDto, type ComparisonDto, type MealTypeDto, type NormalizedNutritionScanDto, type PersonalizationDto } from "@/infrastructure/nutrition/nutrition-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { NutritionAttentionSection, NutritionFactsGrid, NutritionProvenanceSection } from "./nutrition-scan-sections";
import { PackageLabelRecovery } from "./package-label-recovery";

interface DetectedBarcode { rawValue: string; }
interface BarcodeDetectorInstance { detect(source: CanvasImageSource): Promise<DetectedBarcode[]>; }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
interface NativeBarcodeScannerBridge { isAvailable(): boolean; scanBarcode(): void; }

const MEALS: readonly { value: MealTypeDto; label: string }[] = [
  { value: "BREAKFAST", label: "Kahvaltı" }, { value: "LUNCH", label: "Öğle" }, { value: "DINNER", label: "Akşam" }, { value: "SNACK", label: "Ara öğün" },
];
function detectorConstructor(): BarcodeDetectorConstructor | null { if (typeof window === "undefined") return null; return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null; }
function nativeScannerBridge(): NativeBarcodeScannerBridge | null { if (typeof window === "undefined") return null; return (window as unknown as { DiewishScanner?: NativeBarcodeScannerBridge }).DiewishScanner ?? null; }
function validDecodedBarcode(value: string): string { const normalized = value.replace(/\D/g, ""); return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(normalized) ? normalized : ""; }
function nutrient(value: number | null, unit: string): string { return value === null ? "Kaynakta belirtilmemiş" : `${Math.round(value * 10) / 10} ${unit}`; }
function defaultMealType(): MealTypeDto { const h = new Date().getHours(); return h < 11 ? "BREAKFAST" : h < 16 ? "LUNCH" : h < 22 ? "DINNER" : "SNACK"; }
function yesNoUnknown(value: boolean | null, yes: string, no: string): string { return value === true ? yes : value === false ? no : "Kaynakta belirtilmemiş"; }
function coachHref(food: CanonicalFoodDto, grams: number): string {
  const code = food.barcode ? ` Barkodu ${food.barcode}.` : "";
  const source = food.provenance.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL"
    ? "Besin değerleri benim paket üzerinde kontrol edip doğruladığım etiketten geliyor; bunu üretici veritabanı doğrulaması gibi sunma."
    : "Besin değerlerinin kaynak/provenance bilgisini dikkate al.";
  const prompt = `${grams} g ${food.displayNameTr || food.name} günlük hedeflerim açısından benim için ne ifade ediyor?${code} ${source}`;
  return `/ai?prompt=${encodeURIComponent(prompt)}`;
}

export function BarcodeScannerPanel() {
  const [barcode, setBarcode] = React.useState("");
  const [food, setFood] = React.useState<CanonicalFoodDto | null>(null);
  const [scan, setScan] = React.useState<NormalizedNutritionScanDto | null>(null);
  const [grams, setGrams] = React.useState(100);
  const [personalization, setPersonalization] = React.useState<PersonalizationDto | null>(null);
  const [comparison, setComparison] = React.useState<ComparisonDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cameraActive, setCameraActive] = React.useState(false);
  const [nativeScanning, setNativeScanning] = React.useState(false);
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
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);
  React.useEffect(() => stopCamera, [stopCamera]);

  const loadPersonalization = React.useCallback(async (code: string, portionGrams: number) => {
    setPersonalizing(true);
    try { setPersonalization((await nutritionClient.personalize(code, portionGrams)).personalization); }
    catch { setPersonalization(null); }
    finally { setPersonalizing(false); }
  }, []);

  const applyFoundFood = React.useCallback((code: string, nextFood: CanonicalFoodDto, nextScan: NormalizedNutritionScanDto | null) => {
    setFood(nextFood); setScan(nextScan); setNotFound(false); setComparison(null);
    const initialGrams = nextScan?.serving.grams && nextScan.serving.grams > 0
      ? nextScan.serving.grams
      : nextFood.serving?.gramWeight && nextFood.serving.gramWeight > 0 ? nextFood.serving.gramWeight : 100;
    setGrams(initialGrams);
    void loadPersonalization(code, initialGrams);
  }, [loadPersonalization]);

  const lookup = React.useCallback(async (value: string) => {
    const normalized = value.replace(/\D/g, "");
    if (!validDecodedBarcode(normalized)) { toast.error("Geçerli bir GTIN / EAN / UPC barkodu gir."); return; }
    setBarcode(normalized); setLoading(true); setFood(null); setScan(null); setNotFound(false); setPersonalization(null); setComparison(null);
    try {
      const result = await nutritionClient.barcode(normalized);
      if (result.food) applyFoundFood(normalized, result.food, result.scan);
      else { setNotFound(true); toast.message("Ürün ortak kaynaklarda bulunamadı; paket etiketini tarayarak devam edebilirsin."); }
    } catch (error) { toast.error(error instanceof ApiError ? error.message : "Barkod sorgulanamadı."); }
    finally { setLoading(false); }
  }, [applyFoundFood]);

  React.useEffect(() => {
    const onResult = (event: Event) => { const code = validDecodedBarcode((event as CustomEvent<{ barcode?: string }>).detail?.barcode ?? ""); setNativeScanning(false); if (code) void lookup(code); else toast.error("Barkod okunamadı. Lütfen tekrar deneyin."); };
    const onCanceled = () => setNativeScanning(false);
    const onError = (event: Event) => { setNativeScanning(false); const code = (event as CustomEvent<{ code?: string }>).detail?.code; toast.error(code === "CAMERA_PERMISSION_DENIED" ? "Barkod taramak için kamera izni gerekiyor." : "Barkod kamerası açılamadı. Barkodu elle de girebilirsin."); };
    window.addEventListener("diewish:barcode-result", onResult); window.addEventListener("diewish:barcode-canceled", onCanceled); window.addEventListener("diewish:barcode-error", onError);
    return () => { window.removeEventListener("diewish:barcode-result", onResult); window.removeEventListener("diewish:barcode-canceled", onCanceled); window.removeEventListener("diewish:barcode-error", onError); };
  }, [lookup]);

  const startCamera = React.useCallback(async () => {
    if (cameraActive || nativeScanning || loading) return;
    const nativeScanner = nativeScannerBridge();
    if (nativeScanner) { try { if (nativeScanner.isAvailable()) { setNativeScanning(true); nativeScanner.scanBarcode(); return; } } catch { setNativeScanning(false); } }
    const Detector = detectorConstructor();
    if (!Detector) { toast.error("Bu cihazda yerleşik barkod çözme desteklenmiyor. Barkodu elle yazabilirsin."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((track) => track.stop()); throw new Error("camera preview unavailable"); }
      streamRef.current = stream; video.srcObject = stream; setCameraActive(true); await video.play(); scanningRef.current = true;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "itf"] });
      const frame = async () => {
        const current = videoRef.current; if (!scanningRef.current || !current) return;
        if (current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try { const code = (await detector.detect(current)).map((hit) => validDecodedBarcode(hit.rawValue)).find(Boolean); if (code) { stopCamera(); void lookup(code); return; } }
          catch { /* transient frame decode error */ }
        }
        timerRef.current = window.setTimeout(() => void frame(), 200);
      };
      void frame();
    } catch (error) {
      stopCamera(); const denied = error instanceof DOMException && error.name === "NotAllowedError";
      toast.error(denied ? "Barkod taramak için kamera izni gerekiyor." : "Kamera açılamadı. İzni kontrol edebilir veya barkodu elle girebilirsin.");
    }
  }, [cameraActive, loading, lookup, nativeScanning, stopCamera]);

  const updatePortion = React.useCallback(async () => { if (!food?.barcode || !Number.isFinite(grams) || grams <= 0) return; await loadPersonalization(food.barcode, grams); setComparison(null); }, [food, grams, loadPersonalization]);
  const compare = React.useCallback(async () => { if (!food?.barcode) return; setComparing(true); try { setComparison((await nutritionClient.compare(food.barcode, grams)).comparison); } catch (error) { toast.error(error instanceof ApiError ? error.message : "Karşılaştırma yapılamadı."); } finally { setComparing(false); } }, [food, grams]);
  const logMeal = React.useCallback(async () => { if (!food || !personalization) return; setLoggingMeal(true); try { await nutritionClient.logMeal(mealType, food, personalization); toast.success("Öğüne eklendi."); } catch { toast.error("Öğüne eklenemedi."); } finally { setLoggingMeal(false); } }, [food, mealType, personalization]);
  const portionNutrients = personalization?.nutrients ?? scan?.nutrients.perServing ?? food?.nutrientsPer100g;
  const portionLabel = `${Math.round(grams * 10) / 10} g porsiyon`;

  return <div className="space-y-4">
    <Card><CardContent className="space-y-4 p-5">
      <div><h2 className="font-bold">Barkod Tara</h2><p className="text-sm text-muted-foreground">GTIN/EAN/UPC barkodu cihazında çözülür. Diewish önce kayıtlı/veri sağlayıcı kaynaklarını arar; ürün yoksa paketteki gerçek besin etiketini okuyup senin doğrulamana sunar.</p></div>
      <div className={cameraActive ? "overflow-hidden rounded-2xl border bg-black" : "hidden"}><video ref={videoRef} playsInline muted autoPlay className="aspect-video w-full object-cover" aria-label="Barkod kamera önizlemesi" /></div>
      <div className="grid grid-cols-2 gap-2"><Button onClick={() => void startCamera()} disabled={cameraActive || nativeScanning || loading}><Camera /> {nativeScanning ? "Barkod taranıyor…" : cameraActive ? "Kamera açık" : "Kamerayı aç"}</Button><Button variant="outline" onClick={stopCamera} disabled={!cameraActive}><Square /> Durdur</Button></div>
      <div className="flex gap-2"><input value={barcode} onChange={(event) => setBarcode(event.target.value.replace(/\D/g, "").slice(0, 14))} onKeyDown={(event) => { if (event.key === "Enter") void lookup(barcode); }} inputMode="numeric" placeholder="GTIN / EAN / UPC barkodu" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" /><Button variant="outline" onClick={() => void lookup(barcode)} isLoading={loading} disabled={loading || !validDecodedBarcode(barcode)}><Search /> Sorgula</Button></div>
    </CardContent></Card>

    {notFound && <Card><CardContent className="space-y-4 p-5">
      <div className="flex gap-3 text-sm"><TriangleAlert className="size-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Ürün ortak kaynaklarda henüz yok</p><p className="text-muted-foreground">Analiz burada durmaz. Paketin besin tablosunu fotoğraflayarak görünür değerleri okutabilir, kontrol edip bu barkoda kendi hesabın için bağlayabilirsin.</p></div></div>
      <PackageLabelRecovery barcode={barcode} onConfirmed={(nextFood, nextScan) => applyFoundFood(barcode, nextFood, nextScan)} />
      <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => void startCamera()}><RefreshCcw /> Tekrar barkod tara</Button><Button asChild variant="outline"><Link href="/meals/add">Ürünü elle gir</Link></Button></div>
    </CardContent></Card>}

    {food && portionNutrients && <Card><CardContent className="space-y-6 p-5">
      <section><p className="text-xs font-semibold uppercase tracking-wide text-primary">1. Bu ne?</p><div className="mt-2 flex gap-4">{food.imageUrl ? <img src={food.imageUrl} alt={food.displayNameTr} className="size-24 rounded-2xl border object-contain" /> : <div className="size-24 rounded-2xl border bg-muted" />}<div className="min-w-0"><h3 className="text-lg font-bold">{food.displayNameTr || food.name}</h3>{food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}<p className="text-xs text-muted-foreground">{food.quantity ?? "Net miktar kaynakta belirtilmemiş"}</p><p className="text-xs tabular-nums text-muted-foreground">Barkod: {food.barcode}</p>{food.provenance.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL" && <p className="mt-1 rounded-full bg-violet-500/10 px-2 py-1 text-xs font-semibold text-violet-700">Kullanıcı doğrulamalı paket etiketi</p>}</div></div></section>
      <section><p className="text-xs font-semibold uppercase tracking-wide text-primary">2. Besin değerleri</p><div className="mt-2 flex flex-wrap items-center gap-2"><input type="number" min={1} max={5000} value={grams} onChange={(event) => setGrams(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} className="w-24 rounded-xl border px-3 py-2 text-sm" /><span className="text-sm">g</span><Button size="sm" variant="outline" onClick={() => void updatePortion()} isLoading={personalizing}><RefreshCcw /> Porsiyonu değiştir</Button></div><div className="mt-3"><NutritionFactsGrid per100g={scan?.nutrients.per100g ?? food.nutrientsPer100g} portion={portionNutrients} portionLabel={portionLabel} /></div></section>
      <section><p className="text-xs font-semibold uppercase tracking-wide text-primary">3. Senin İçin</p>{personalizing && <p className="mt-2 text-sm text-muted-foreground">Aktif planın ve bugünkü kayıtlarınla karşılaştırılıyor…</p>}{!personalizing && personalization?.metrics && <div className="mt-2 space-y-2">{personalization.metrics.lines.map((line) => <p key={line} className="rounded-xl bg-primary/5 p-3 text-sm">{line}</p>)}</div>}{!personalizing && !personalization?.metrics && <p className="mt-2 text-sm text-muted-foreground">Aktif bir beslenme planın olduğunda bu ürünün günlük hedeflerine katkısı burada gösterilir.</p>}</section>
      <section><p className="text-xs font-semibold uppercase tracking-wide text-primary">4. Dikkat edilebilecekler</p><div className="mt-2"><NutritionAttentionSection flags={personalization?.attentionFlags ?? []} warnings={personalization?.warnings} /></div></section>
      <section className="space-y-3 text-sm"><p className="font-semibold">Ürün bilgileri</p><div className="grid gap-2 sm:grid-cols-2"><p>Nutri-Score: <strong>{food.nutriScore?.toUpperCase() ?? "Kaynakta belirtilmemiş"}</strong></p><p>NOVA: <strong>{food.novaGroup ?? "Kaynakta belirtilmemiş"}</strong></p><p>Vegan: <strong>{yesNoUnknown(food.vegan, "Evet", "Hayır")}</strong></p><p>Vejetaryen: <strong>{yesNoUnknown(food.vegetarian, "Evet", "Hayır")}</strong></p><p>Gluten bilgisi: <strong>{yesNoUnknown(food.glutenFree, "Glutensiz", "Gluten içeriyor")}</strong></p></div><div><p className="font-semibold">İçerik</p><p className="text-muted-foreground">{food.ingredients.length > 0 ? food.ingredients.join(", ") : "Etikette/kaynakta belirtilmemiş"}</p></div><div><p className="font-semibold">Alerjenler</p><p className="text-muted-foreground">{food.allergens.length > 0 ? food.allergens.join(", ") : "Etikette/kaynakta belirtilmemiş"}</p></div></section>
      <section><p className="text-xs font-semibold uppercase tracking-wide text-primary">5. Veri kaynağı</p><div className="mt-2"><NutritionProvenanceSection sources={scan?.provenance.nutrition ?? [food.provenance]} /></div>{scan?.disclaimer && <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">{scan.disclaimer}</p>}</section>
      <section><p className="text-xs font-semibold uppercase tracking-wide text-primary">6. Ne yapabilirsin?</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="flex gap-2"><select value={mealType} onChange={(event) => setMealType(event.target.value as MealTypeDto)} className="min-w-0 flex-1 rounded-xl border bg-background px-2 text-sm">{MEALS.map((meal) => <option key={meal.value} value={meal.value}>{meal.label}</option>)}</select><Button onClick={() => void logMeal()} isLoading={loggingMeal} disabled={!personalization}><Utensils /> Öğüne ekle</Button></div><Button variant="outline" onClick={() => void compare()} isLoading={comparing}><Scale /> Kalori karşılaştır</Button><Button variant="outline" onClick={() => void nutritionClient.setFavorite(food.barcode ?? barcode, true).then(() => toast.success("Favorilere eklendi."))}><Heart /> Favorilere ekle</Button><Button asChild variant="outline"><Link href={coachHref(food, grams)}><MessageCircle /> AI Koç&apos;a sor</Link></Button></div></section>
    </CardContent></Card>}

    {comparison && <Card><CardContent className="space-y-3 p-5"><div><h3 className="font-bold">Aynı kaloride neler var?</h3><p className="text-xs text-muted-foreground">{comparison.warning}</p></div>{comparison.comparisons.length === 0 ? <p className="text-sm text-muted-foreground">Güvenilir alternatif bulunamadı.</p> : comparison.comparisons.map((item) => <div key={`${item.food.provider}-${item.food.externalId}`} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><p className="font-semibold">{item.food.displayNameTr}</p><p className="font-semibold">~{Math.round(item.servingGrams)} g</p></div><p className="mt-1 text-xs text-muted-foreground">Protein {nutrient(item.nutrients.proteinG, "g")} · Lif {nutrient(item.nutrients.fiberG, "g")} · Şeker {nutrient(item.nutrients.sugarsG, "g")}</p><p className="text-xs text-muted-foreground">Tercih uyumu: {item.dietaryCompatibility === "COMPATIBLE" ? "uygun" : item.dietaryCompatibility === "INCOMPATIBLE" ? "uygun değil" : "doğrulanamadı"}{!item.allergenDataComplete ? " · alerjen verisi eksik olabilir" : ""}</p></div>)}</CardContent></Card>}
  </div>;
}
