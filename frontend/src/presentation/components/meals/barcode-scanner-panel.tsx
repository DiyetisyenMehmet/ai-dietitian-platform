"use client";

import * as React from "react";
import Link from "next/link";
import {
  Camera,
  Flame,
  Heart,
  Info,
  MessageCircle,
  Package,
  Plus,
  RefreshCcw,
  Scale,
  Search,
  Square,
  Target,
  TriangleAlert,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import {
  nutritionClient,
  type CanonicalFoodDto,
  type ComparisonDto,
  type MealTypeDto,
  type NormalizedNutritionScanDto,
  type NutrientValuesDto,
  type PersonalizationDto,
} from "@/infrastructure/nutrition/nutrition-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  NutritionAttentionSection,
  NutritionFactsGrid,
  NutritionProvenanceSection,
} from "./nutrition-scan-sections";
import { BarcodeProductSearch } from "./barcode-product-search";
import { PackageLabelRecovery } from "./package-label-recovery";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

interface NativeBarcodeScannerBridge {
  isAvailable(): boolean;
  scanBarcode(): void;
}

const MEALS: readonly { value: MealTypeDto; label: string }[] = [
  { value: "BREAKFAST", label: "Kahvaltı" },
  { value: "LUNCH", label: "Öğle" },
  { value: "DINNER", label: "Akşam" },
  { value: "SNACK", label: "Ara öğün" },
];

function detectorConstructor(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

function nativeScannerBridge(): NativeBarcodeScannerBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { DiewishScanner?: NativeBarcodeScannerBridge }).DiewishScanner ?? null;
}

function validDecodedBarcode(value: string): string {
  const normalized = value.replace(/\D/g, "");
  return /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(normalized) ? normalized : "";
}

function nutrient(value: number | null, unit: string): string {
  return value === null ? "Bilgi bulunamadı" : `${Math.round(value * 10) / 10} ${unit}`;
}

function roundedGrams(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function parseGrams(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 5000 ? parsed : null;
}

function defaultMealType(): MealTypeDto {
  const h = new Date().getHours();
  return h < 11 ? "BREAKFAST" : h < 16 ? "LUNCH" : h < 22 ? "DINNER" : "SNACK";
}

function yesNoUnknown(value: boolean | null, yes: string, no: string): string {
  return value === true ? yes : value === false ? no : "Bilgi bulunamadı";
}

function sourceBasis(food: CanonicalFoodDto): string {
  if (food.provenance.dataBasis === "PER_100_G") return "100 g";
  const serving = food.serving?.description?.trim();
  if (serving) return serving;
  if (food.serving?.gramWeight) return `${roundedGrams(food.serving.gramWeight)} g`;
  return "Porsiyon";
}

function portionDescriptor(food: CanonicalFoodDto): string | null {
  const description = food.serving?.description?.trim();
  if (!description) return null;
  const compact = description.replace(/\s+/g, " ");
  if (/^\d+(?:[.,]\d+)?\s*(?:g|gram|ml)$/i.test(compact)) return null;
  return compact;
}

function consumedPortionLabel(grams: number): string {
  return `${roundedGrams(grams)} g tüketim`;
}

function coachHref(food: CanonicalFoodDto, grams: number, nutrients: NutrientValuesDto): string {
  const code = food.barcode ? ` Barkodu ${food.barcode}.` : "";
  const facts = [
    nutrients.energyKcal === null ? null : `${Math.round(nutrients.energyKcal)} kcal`,
    nutrients.proteinG === null ? null : `${Math.round(nutrients.proteinG * 10) / 10} g protein`,
    nutrients.carbohydratesG === null ? null : `${Math.round(nutrients.carbohydratesG * 10) / 10} g karbonhidrat`,
    nutrients.fatG === null ? null : `${Math.round(nutrients.fatG * 10) / 10} g yağ`,
    nutrients.sugarsG === null ? null : `${Math.round(nutrients.sugarsG * 10) / 10} g şeker`,
  ].filter((item): item is string => Boolean(item));
  const nutrition = facts.length > 0 ? ` Seçili porsiyon değerleri: ${facts.join(", ")}.` : "";
  const source = food.provenance.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL"
    ? " Besin değerleri benim paket üzerinde kontrol edip doğruladığım etiketten geliyor; bunu üretici veritabanı doğrulaması gibi sunma."
    : "";
  const prompt = `${roundedGrams(grams)} g ${food.displayNameTr || food.name} hakkında, doğrulanmış besin verilerini ve günlük hedeflerimi kullanarak benim için ne ifade ettiğini açıklar mısın?${nutrition}${code}${source}`;
  return `/ai?prompt=${encodeURIComponent(prompt)}`;
}

function productUsageLabel(food: CanonicalFoodDto): string {
  switch (food.productUsage?.type ?? "UNKNOWN") {
    case "DIRECT_CONSUMPTION": return "Doğrudan tüketilir";
    case "BREWING": return "Demlenerek kullanılır";
    case "BLENDING_AROMA": return "Harmanlama / aroma amaçlı kullanılır";
    case "SPICE": return "Baharat / çeşni";
    case "COOKING_INGREDIENT": return "Yemek hazırlamada kullanılır";
    case "SAUCE": return "Sos";
    case "SWEETENER": return "Tatlandırıcı";
    case "PREPARATION_BASE": return "Hazırlanarak tüketilir";
    default: return "Kullanım şekli doğrulanamadı";
  }
}

function preparationUsageNotice(food: CanonicalFoodDto): string | null {
  switch (food.productUsage?.type) {
    case "BREWING":
      return "Bu ürün demlenerek kullanılır. Paket miktarı ve kuru ürünün 100 g besin referansı, hazırlanmış içeceğin tüketim miktarı değildir.";
    case "BLENDING_AROMA":
      return "Bu ürün harmanlama veya aroma amacıyla kullanılabilir. Paket miktarı otomatik tüketim porsiyonu değildir.";
    case "PREPARATION_BASE":
      return "Bu ürün hazırlanarak tüketilir. Kaynakta kuru/toz ürün için verilen besin değerleri hazırlanmış ürünün aynı miktardaki değeri gibi yorumlanmaz.";
    case "SPICE":
      return "Baharat ve çeşnilerde paket miktarı otomatik tüketim porsiyonu değildir.";
    case "COOKING_INGREDIENT":
      return "Bu ürün yemek hazırlamada kullanılır. Paket miktarı otomatik tüketim porsiyonu değildir.";
    default:
      return null;
  }
}

function productLifecycleLabel(food: CanonicalFoodDto): string {
  switch (food.productLifecycle?.status ?? "UNKNOWN") {
    case "ACTIVE": return "Güncel ürün";
    case "OLD_VERSION": return "Eski sürüm";
    case "DISCONTINUED": return "Üretimden kaldırılmış";
    case "REPLACED": return "Yeni sürümü mevcut";
    default: return "Durum doğrulanamadı";
  }
}

function productLifecycleNotice(food: CanonicalFoodDto): string | null {
  switch (food.productLifecycle?.status) {
    case "OLD_VERSION":
      return "Bu ürün eski bir varyant olarak kayıtlı. Besin bilgileri bu varyanta aittir.";
    case "DISCONTINUED":
      return "Bu ürün üretimden kaldırılmış olarak kayıtlı. Mevcut besin bilgileri geçmiş ürün kaydı olarak korunur.";
    case "REPLACED":
      return food.productLifecycle.replacedBy?.barcode
        ? `Bu ürünün daha yeni bir sürümü mevcut. Yeni sürüm barkodu: ${food.productLifecycle.replacedBy.barcode}.`
        : "Bu ürünün daha yeni bir sürümü mevcut.";
    default:
      return null;
  }
}

function productInfoRows(food: CanonicalFoodDto): Array<[string, string]> {
  return [
    ["Ürün durumu", productLifecycleLabel(food)],
    ["Kategori", food.productCatalog?.category?.name ?? "Bilgi bulunamadı"],
    ["Alt kategori", food.productCatalog?.subcategory?.name ?? "Bilgi bulunamadı"],
    ["Marka", food.productCatalog?.brand?.name ?? food.brand ?? "Bilgi bulunamadı"],
    ["Ürün ailesi", food.productCatalog?.family?.name ?? "Bilgi bulunamadı"],
    ["Varyant", food.productCatalog?.variant?.name ?? "Bilgi bulunamadı"],
    ["Kullanım", productUsageLabel(food)],
    ["Nutri-Score", food.nutriScore?.toUpperCase() ?? "Bilgi bulunamadı"],
    ["NOVA", food.novaGroup === null ? "Bilgi bulunamadı" : String(food.novaGroup)],
    ["Vegan", yesNoUnknown(food.vegan, "Evet", "Hayır")],
    ["Vejetaryen", yesNoUnknown(food.vegetarian, "Evet", "Hayır")],
    ["Gluten bilgisi", yesNoUnknown(food.glutenFree, "Glutensiz", "Gluten içeriyor")],
    ["İçerik", food.ingredients.length > 0 ? food.ingredients.join(", ") : "Bilgi bulunamadı"],
    ["Alerjenler", food.allergens.length > 0 ? food.allergens.join(", ") : "Bilgi bulunamadı"],
    [
      "Çapraz bulaşma uyarısı",
      food.allergenEvidence?.crossContaminationWarnings.length
        ? food.allergenEvidence.crossContaminationWarnings.join("; ")
        : "Kaynakta bilgi bulunamadı",
    ],
    ["Katkı maddeleri", food.additives.length > 0 ? food.additives.join(", ") : "Bilgi bulunamadı"],
  ];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-extrabold uppercase tracking-tight text-primary">{children}</h2>;
}

export function BarcodeScannerPanel() {
  const [barcode, setBarcode] = React.useState("");
  const [food, setFood] = React.useState<CanonicalFoodDto | null>(null);
  const [scan, setScan] = React.useState<NormalizedNutritionScanDto | null>(null);
  const [grams, setGrams] = React.useState<number | null>(null);
  const [portionInput, setPortionInput] = React.useState("");
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
  const [favoriting, setFavoriting] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const scanningRef = React.useRef(false);
  const historyLookupRef = React.useRef(false);

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

  const loadPersonalization = React.useCallback(async (code: string, portionGrams: number, notify = false) => {
    setPersonalizing(true);
    try {
      const result = await nutritionClient.personalize(code, portionGrams);
      setPersonalization(result.personalization);
      return result.personalization;
    } catch (error) {
      if (notify) {
        toast.error(error instanceof ApiError ? error.message : "Porsiyon değerleri güncellenemedi.");
      }
      return null;
    } finally {
      setPersonalizing(false);
    }
  }, []);

  const applyFoundFood = React.useCallback(
    (
      _code: string,
      nextFood: CanonicalFoodDto,
      nextScan: NormalizedNutritionScanDto | null,
    ) => {
      setFood(nextFood);
      setScan(nextScan);
      setNotFound(false);
      setComparison(null);
      setPersonalization(null);
      // Package quantity, nutrition reference and provider serving are source
      // metadata. None of them is evidence of what the user consumed.
      setGrams(null);
      setPortionInput("");
    },
    [],
  );

  const selectCatalogProduct = React.useCallback(
    (nextFood: CanonicalFoodDto) => {
      if (!nextFood.barcode) return;
      // Name search is product discovery, not consumption. The user must
      // explicitly choose a consumed amount before nutrition is personalized.
      applyFoundFood(nextFood.barcode, nextFood, null);
    },
    [applyFoundFood],
  );

  const lookup = React.useCallback(
    async (value: string) => {
      const normalized = validDecodedBarcode(value);
      if (!normalized) {
        toast.error("Geçerli bir GTIN / EAN / UPC barkodu gir.");
        return;
      }
      setBarcode(normalized);
      setLoading(true);
      setFood(null);
      setScan(null);
      setNotFound(false);
      setPersonalization(null);
      setComparison(null);
      setGrams(null);
      setPortionInput("");
      try {
        const result = await nutritionClient.barcode(normalized);
        if (result.food) {
          applyFoundFood(normalized, result.food, result.scan);
        } else {
          setNotFound(true);
          toast.message("Ürün ortak kaynaklarda bulunamadı; paket etiketini tarayarak devam edebilirsin.");
        }
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "Barkod sorgulanamadı.");
      } finally {
        setLoading(false);
      }
    },
    [applyFoundFood],
  );

  React.useEffect(() => {
    if (historyLookupRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = validDecodedBarcode(params.get("barcode") ?? "");
    if (!code) return;
    historyLookupRef.current = true;
    setBarcode(code);
    void lookup(code);
  }, [lookup]);

  React.useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ barcode?: string }>).detail;
      const code = validDecodedBarcode(detail?.barcode ?? "");
      setNativeScanning(false);
      if (code) {
        void lookup(code);
      } else {
        toast.error("Barkod okunamadı. Lütfen tekrar deneyin.");
      }
    };
    const onCanceled = () => setNativeScanning(false);
    const onError = (event: Event) => {
      setNativeScanning(false);
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      toast.error(
        code === "CAMERA_PERMISSION_DENIED"
          ? "Barkod taramak için kamera izni gerekiyor."
          : "Barkod kamerası açılamadı. Barkodu elle de girebilirsin.",
      );
    };

    window.addEventListener("diewish:barcode-result", onResult);
    window.addEventListener("diewish:barcode-canceled", onCanceled);
    window.addEventListener("diewish:barcode-error", onError);
    return () => {
      window.removeEventListener("diewish:barcode-result", onResult);
      window.removeEventListener("diewish:barcode-canceled", onCanceled);
      window.removeEventListener("diewish:barcode-error", onError);
    };
  }, [lookup]);

  const startCamera = React.useCallback(async () => {
    if (cameraActive || nativeScanning || loading) return;

    const nativeScanner = nativeScannerBridge();
    if (nativeScanner) {
      try {
        if (nativeScanner.isAvailable()) {
          setNativeScanning(true);
          nativeScanner.scanBarcode();
          return;
        }
      } catch {
        setNativeScanning(false);
      }
    }

    const Detector = detectorConstructor();
    if (!Detector) {
      toast.error("Bu cihazda yerleşik barkod çözme desteklenmiyor. Barkodu elle yazabilirsin.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("camera preview unavailable");
      }

      streamRef.current = stream;
      video.srcObject = stream;
      setCameraActive(true);
      await video.play();
      scanningRef.current = true;
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "itf"] });
      const frame = async () => {
        const current = videoRef.current;
        if (!scanningRef.current || !current) return;
        if (current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const hits = await detector.detect(current);
            const code = hits.map((hit) => validDecodedBarcode(hit.rawValue)).find(Boolean);
            if (code) {
              stopCamera();
              void lookup(code);
              return;
            }
          } catch {
            // A transient frame decode error is expected while autofocus/exposure settles.
          }
        }
        timerRef.current = window.setTimeout(() => void frame(), 200);
      };
      void frame();
    } catch (error) {
      stopCamera();
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      toast.error(
        denied
          ? "Barkod taramak için kamera izni gerekiyor."
          : "Kamera açılamadı. İzni kontrol edebilir veya barkodu elle girebilirsin.",
      );
    }
  }, [cameraActive, loading, lookup, nativeScanning, stopCamera]);

  const updatePortion = React.useCallback(async () => {
    if (!food?.barcode) return;
    const nextGrams = parseGrams(portionInput);
    if (nextGrams === null) {
      toast.error("Porsiyon 1 g ile 5000 g arasında olmalıdır.");
      return;
    }
    const next = await loadPersonalization(food.barcode, nextGrams, true);
    if (!next) return;
    setGrams(next.grams);
    setPortionInput(roundedGrams(next.grams));
    setComparison(null);
  }, [food, loadPersonalization, portionInput]);

  const portionInputValue = parseGrams(portionInput);
  const portionDirty =
    grams === null ||
    portionInputValue === null ||
    Math.abs(portionInputValue - grams) > 0.0001;

  const compare = React.useCallback(async () => {
    if (!food?.barcode || portionDirty || grams === null) return;
    setComparing(true);
    try {
      setComparison((await nutritionClient.compare(food.barcode, grams)).comparison);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Karşılaştırma yapılamadı.");
    } finally {
      setComparing(false);
    }
  }, [food, grams, portionDirty]);

  const logMeal = React.useCallback(async () => {
    if (!food || !personalization || portionDirty || grams === null) return;
    setLoggingMeal(true);
    try {
      await nutritionClient.logMeal(mealType, food, personalization);
      toast.success(`${roundedGrams(grams)} g porsiyon öğüne eklendi.`);
    } catch {
      toast.error("Öğüne eklenemedi.");
    } finally {
      setLoggingMeal(false);
    }
  }, [food, grams, mealType, personalization, portionDirty]);

  const addFavorite = React.useCallback(async () => {
    if (!food) return;
    setFavoriting(true);
    try {
      await nutritionClient.setFavorite(food.barcode ?? barcode, true);
      toast.success("Favorilere eklendi.");
    } catch {
      toast.error("Favorilere eklenemedi.");
    } finally {
      setFavoriting(false);
    }
  }, [barcode, food]);

  const portionNutrients = personalization?.nutrients ?? null;
  const referenceNutrients = scan?.nutrients.reference ?? food?.nutrientsPer100g ?? null;
  const referenceLabel = scan?.nutritionReference.description ?? (food ? sourceBasis(food) : "Kaynak referansı");

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex justify-end">
        <BarcodeProductSearch onSelect={selectCatalogProduct} />
      </div>

      {!food && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="font-bold">Barkod Tara</h2>
              <p className="text-sm text-muted-foreground">
                GTIN/EAN/UPC barkodu cihazında çözülür. Diewish doğrulanmış ürün kaynaklarını arar; ürün bulunamazsa paket etiketini tarayarak devam edebilirsin.
              </p>
            </div>
            <div className={cameraActive ? "overflow-hidden rounded-2xl border bg-black" : "hidden"}>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="aspect-video w-full object-cover"
                aria-label="Barkod kamera önizlemesi"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void startCamera()} disabled={cameraActive || nativeScanning || loading}>
                <Camera aria-hidden="true" /> {nativeScanning ? "Barkod taranıyor…" : cameraActive ? "Kamera açık" : "Kamerayı aç"}
              </Button>
              <Button variant="outline" onClick={stopCamera} disabled={!cameraActive}>
                <Square aria-hidden="true" /> Durdur
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                value={barcode}
                onChange={(event) => setBarcode(event.target.value.replace(/\D/g, "").slice(0, 14))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void lookup(barcode);
                }}
                inputMode="numeric"
                aria-label="Barkod numarası"
                placeholder="GTIN / EAN / UPC barkod numarası"
                className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
              />
              <Button
                variant="outline"
                onClick={() => void lookup(barcode)}
                isLoading={loading}
                disabled={loading || !validDecodedBarcode(barcode)}
              >
                <Search aria-hidden="true" /> Sorgula
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {notFound && !food && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-3 text-sm">
              <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-semibold">Ürün ortak kaynaklarda henüz yok</p>
                <p className="text-muted-foreground">
                  Paketin besin tablosunu fotoğraflayabilir, okunan değerleri kontrol edip bu barkoda yalnız kendi hesabın için bağlayabilirsin.
                </p>
              </div>
            </div>
            <PackageLabelRecovery
              barcode={barcode}
              onConfirmed={(nextFood, nextScan) => applyFoundFood(barcode, nextFood, nextScan)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => void startCamera()}>
                <RefreshCcw aria-hidden="true" /> Tekrar barkod tara
              </Button>
              <Button asChild variant="outline">
                <Link href="/meals/add">Ürünü elle gir</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {food && !portionNutrients && personalizing && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">Porsiyon değerleri hazırlanıyor…</CardContent>
        </Card>
      )}

      {food && (
        <>
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <SectionTitle>1. Bu ne?</SectionTitle>
              <div className="flex items-start gap-4">
                {food.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={food.imageUrl}
                    alt={food.displayNameTr || food.name}
                    className="size-28 shrink-0 rounded-[1.75rem] border bg-primary/5 object-contain p-2 sm:size-32"
                  />
                ) : (
                  <div className="flex size-28 shrink-0 items-center justify-center rounded-[1.75rem] border bg-primary/5 sm:size-32" aria-label="Ürün görseli bulunamadı">
                    <Package className="size-10 text-primary/60" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1 pt-1">
                  <h3 className="break-words text-xl font-extrabold leading-tight text-foreground sm:text-2xl">
                    {food.displayNameTr || food.name}
                  </h3>
                  {food.brand && <p className="mt-0.5 text-sm font-medium text-muted-foreground">{food.brand}</p>}
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-xl bg-primary/5 px-3 py-2">
                      <p className="text-muted-foreground">Paket</p>
                      <p className="mt-0.5 font-bold text-foreground">{food.quantity ?? "Bilgi bulunamadı"}</p>
                    </div>
                    <div className="rounded-xl bg-primary/5 px-3 py-2">
                      <p className="text-muted-foreground">Besin referansı</p>
                      <p className="mt-0.5 font-bold text-foreground">{referenceLabel} için</p>
                    </div>
                    <div className="rounded-xl bg-primary/5 px-3 py-2">
                      <p className="text-muted-foreground">Tüketilen miktar</p>
                      <p className="mt-0.5 font-bold text-foreground">
                        {grams === null ? "Henüz seçilmedi" : `${roundedGrams(grams)} g`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                    <p className="break-all tabular-nums">Barkod: {food.barcode ?? barcode}</p>
                    {portionDescriptor(food) && (
                      <p>Kaynak porsiyon bilgisi: {portionDescriptor(food)}. Bu değer otomatik tüketim sayılmaz.</p>
                    )}
                  </div>
                </div>
              </div>
              {food.provenance.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL" && (
                <p className="rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
                  Kullanıcı doğrulamalı paket etiketi
                </p>
              )}
              {preparationUsageNotice(food) && (
                <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  {preparationUsageNotice(food)}
                </p>
              )}
              {productLifecycleNotice(food) && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                  {productLifecycleNotice(food)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <SectionTitle>2. Tüketilen miktar ve besin değerleri</SectionTitle>
              <div>
                <label htmlFor="portion-grams" className="mb-2 block text-sm font-medium text-muted-foreground">
                  Tüketilen miktar
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-2.5">
                  <div className="relative">
                    <input
                      id="portion-grams"
                      type="text"
                      inputMode="decimal"
                      value={portionInput}
                      placeholder="örn. 25"
                      onChange={(event) => setPortionInput(event.target.value.replace(/[^0-9.,]/g, "").slice(0, 7))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void updatePortion();
                      }}
                      aria-label="Seçilen porsiyon gramı"
                      className="h-12 w-full rounded-2xl border bg-background px-4 pr-10 text-lg font-bold tabular-nums outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">g</span>
                  </div>
                  <Button
                    className="h-12 rounded-2xl"
                    variant="secondary"
                    onClick={() => void updatePortion()}
                    isLoading={personalizing}
                    disabled={personalizing || !portionDirty}
                    aria-label="Tüketilen miktarı uygula ve besin değerlerini hesapla"
                  >
                    <RefreshCcw aria-hidden="true" /> Miktarı Uygula
                  </Button>
                </div>
                {grams === null && !personalizing ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ürün taraması tüketim değildir. Yediğin veya içtiğin gerçek miktarı girip uygula.
                  </p>
                ) : portionDirty && !personalizing ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Değiştirdiğin miktarı uyguladığında besin değerleri yeniden hesaplanır.
                  </p>
                ) : null}
              </div>

              <div className="flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p>
                  Kaynak besin değeri {referenceLabel} referansına aittir. Paket miktarı ve kaynak porsiyon bilgisi tüketim değildir.
                </p>
              </div>

              {portionNutrients && grams !== null ? (
                <NutritionFactsGrid portion={portionNutrients} portionLabel={consumedPortionLabel(grams)} />
              ) : referenceNutrients ? (
                <NutritionFactsGrid portion={referenceNutrients} portionLabel={`${referenceLabel} referans`} />
              ) : (
                <p className="text-sm text-muted-foreground">Kaynak besin değerleri bulunamadı.</p>
              )}

              {scan?.additionalNutritionReferences.map((reference, index) => (
                <div key={`${reference.description}-${index}`} className="space-y-2 rounded-2xl border border-primary/20 p-3">
                  <p className="text-xs font-bold text-foreground">Hazırlanmış ürün için ayrı etiket referansı</p>
                  <NutritionFactsGrid portion={reference.nutrients} portionLabel={reference.description} />
                  <p className="text-[11px] text-muted-foreground">Bu değer ayrı bir etiket referansıdır; tüketilen miktar değildir.</p>
                </div>
              ))}

              <Button
                className="h-12 w-full rounded-2xl text-base font-bold"
                onClick={() => void logMeal()}
                isLoading={loggingMeal}
                disabled={!personalization || portionDirty || personalizing || grams === null}
                aria-label={
                  grams === null
                    ? "Öğüne eklemek için tüketilen miktarı seç"
                    : `${roundedGrams(grams)} gram tüketimi ${MEALS.find((meal) => meal.value === mealType)?.label ?? "öğüne"} ekle`
                }
              >
                <Plus aria-hidden="true" /> Öğüne Ekle
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SectionTitle>3. Senin İçin</SectionTitle>
              {personalizing && (
                <p className="text-sm text-muted-foreground">Aktif planın ve bugünkü kayıtlarınla karşılaştırılıyor…</p>
              )}
              {grams !== null && !personalizing && personalization?.metrics && (
                <div className="space-y-2">
                  {personalization.metrics.lines.slice(0, 4).map((line) => (
                    <div key={line} className="flex gap-3 rounded-2xl bg-primary/5 p-3 text-sm">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Target className="size-4" aria-hidden="true" />
                      </span>
                      <p className="self-center text-foreground">{line}</p>
                    </div>
                  ))}
                </div>
              )}
              {!personalizing && grams === null && (
                <div className="flex gap-3 rounded-2xl bg-primary/5 p-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Target className="size-4" aria-hidden="true" />
                  </span>
                  <p className="self-center text-muted-foreground">
                    Tükettiğin miktarı seçtiğinde bu ürünün günlük hedeflerine katkısı burada gösterilir.
                  </p>
                </div>
              )}
              {!personalizing && grams !== null && !personalization?.metrics && (
                <div className="flex gap-3 rounded-2xl bg-primary/5 p-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Target className="size-4" aria-hidden="true" />
                  </span>
                  <p className="self-center text-muted-foreground">
                    Aktif bir beslenme planın olduğunda bu miktarın günlük hedeflerine katkısı burada gösterilir.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <SectionTitle>4. Dikkat edilebilecekler</SectionTitle>
              <NutritionAttentionSection
                flags={personalization?.attentionFlags ?? []}
                warnings={personalization?.warnings}
              />
            </CardContent>
          </Card>

          <section className="space-y-2" aria-labelledby="product-info-title">
            <h2 id="product-info-title" className="px-1 text-lg font-extrabold text-foreground">Ürün bilgileri</h2>
            <Card>
              <CardContent className="p-0">
                <dl className="divide-y">
                  {productInfoRows(food).map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 px-4 py-2 text-sm">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="break-words text-right font-semibold text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SectionTitle>5. Veri kaynağı</SectionTitle>
              <NutritionProvenanceSection sources={scan?.provenance.nutrition ?? [food.provenance]} />
              {scan?.disclaimer && (
                <p className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                  {scan.disclaimer}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SectionTitle>6. Ne yapabilirsin?</SectionTitle>
              <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] gap-2.5">
                <label className="sr-only" htmlFor="meal-type">Öğün seçimi</label>
                <div className="relative">
                  <Utensils className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" aria-hidden="true" />
                  <select
                    id="meal-type"
                    value={mealType}
                    onChange={(event) => setMealType(event.target.value as MealTypeDto)}
                    className="h-12 w-full appearance-none rounded-2xl border bg-background pl-9 pr-8 text-sm font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {MEALS.map((meal) => (
                      <option key={meal.value} value={meal.value}>{meal.label}</option>
                    ))}
                  </select>
                </div>
                <Button
                  className="h-12 rounded-2xl font-bold"
                  onClick={() => void logMeal()}
                  isLoading={loggingMeal}
                  disabled={!personalization || portionDirty || personalizing || grams === null}
                >
                  <Plus aria-hidden="true" /> Öğüne ekle
                </Button>
              </div>
              <Button className="h-11 w-full rounded-2xl" variant="outline" onClick={() => void compare()} isLoading={comparing} disabled={grams === null || portionDirty || personalizing}>
                <Scale aria-hidden="true" /> Kalori karşılaştır
              </Button>
              <Button className="h-11 w-full rounded-2xl" variant="outline" onClick={() => void addFavorite()} isLoading={favoriting}>
                <Heart aria-hidden="true" /> Favorilere ekle
              </Button>
              {grams !== null && portionNutrients ? (
                <Button className="h-11 w-full rounded-2xl" asChild variant="outline">
                  <Link href={coachHref(food, grams, portionNutrients)}>
                    <MessageCircle aria-hidden="true" /> Diewish Koç&apos;a sor
                  </Link>
                </Button>
              ) : (
                <Button className="h-11 w-full rounded-2xl" variant="outline" disabled>
                  <MessageCircle aria-hidden="true" /> Diewish Koç&apos;a sor
                </Button>
              )}
              {portionDirty && (
                <p className="text-center text-xs text-muted-foreground">Karşılaştırma ve öğüne ekleme için önce yeni porsiyonu uygula.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {comparison && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <h3 className="font-bold">Aynı kaloride neler var?</h3>
              <p className="text-xs text-muted-foreground">{comparison.warning}</p>
            </div>
            {comparison.comparisons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Güvenilir alternatif bulunamadı.</p>
            ) : (
              comparison.comparisons.map((item) => (
                <div key={`${item.food.provider}-${item.food.externalId}`} className="rounded-2xl border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="min-w-0 break-words font-semibold">{item.food.displayNameTr}</p>
                    <p className="shrink-0 font-semibold">~{Math.round(item.servingGrams)} g</p>
                  </div>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    Protein {nutrient(item.nutrients.proteinG, "g")} · Lif {nutrient(item.nutrients.fiberG, "g")} · Şeker {nutrient(item.nutrients.sugarsG, "g")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tercih uyumu: {item.dietaryCompatibility === "COMPATIBLE" ? "uygun" : item.dietaryCompatibility === "INCOMPATIBLE" ? "uygun değil" : "doğrulanamadı"}
                    {item.allergenSafety.status === "UNKNOWN"
                      ? " · alerjen bilgisi yeterli değil"
                      : item.allergenSafety.status === "KNOWN_RISK"
                        ? " · kayıtlı alerji eşleşmesi var"
                        : item.allergenDataComplete
                          ? " · kayıtlı alerjilerle eşleşme bulunmadı"
                          : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
