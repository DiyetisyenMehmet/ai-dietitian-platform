"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useJourneyEntry } from "@/application/meals/journey-entry";
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
import { parsePackageSize, nutrientsForAmount, volumeReference, type PackageUnit, type SelectedConsumption } from "@/application/meals/package-consumption";

import { ApiError } from "@/infrastructure/api/http-client";
import {
  nutritionClient,
  type CanonicalFoodDto,
  type ComparisonDto,
  type MealTypeDto,
  type NormalizedNutritionScanDto,
  type NutrientValuesDto,
  type PersonalizationContextDto,
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
import {
  allergenDataNotice,
  comparisonNutritionText,
  partialProductDataNotice,
  productDataTrustExplanation,
  productInfoRows,
} from "./product-data-display";

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-extrabold uppercase tracking-tight text-primary">{children}</h2>;
}

export function BarcodeScannerPanel({ journeyToken }: { journeyToken?: string } = {}) {
  const router = useRouter();
  const journey = useJourneyEntry(journeyToken);
  const [barcode, setBarcode] = React.useState("");
  const [food, setFood] = React.useState<CanonicalFoodDto | null>(null);
  const [scan, setScan] = React.useState<NormalizedNutritionScanDto | null>(null);
  const [grams, setGrams] = React.useState<number | null>(null);
  const [portionInput, setPortionInput] = React.useState("");
  const [personalization, setPersonalization] = React.useState<PersonalizationContextDto | null>(null);
  const [consumptionOpen, setConsumptionOpen] = React.useState(false);
  const [consumptionUnit, setConsumptionUnit] = React.useState<"package" | PackageUnit>("g");
  const [selectedConsumption, setSelectedConsumption] = React.useState<SelectedConsumption | null>(null);
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
      setPortionInput(parsePackageSize(nextFood.quantity) ? "1" : "");
      setConsumptionUnit(parsePackageSize(nextFood.quantity) ? "package" : volumeReference(nextFood) ? "ml" : "g");
      setConsumptionOpen(false);
      setSelectedConsumption(null);
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
      setConsumptionOpen(false);
      setSelectedConsumption(null);
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

  const packageSize = food ? parsePackageSize(food.quantity) : null;
  const displayedPackageNutrients = food && packageSize
    ? nutrientsForAmount(food, packageSize.totalAmount ?? packageSize.amount, packageSize.unit) : null;
  const volumeSource = food ? volumeReference(food) : null;
  const parsedCount = parseGrams(portionInput);
  const calculatedAmount = parsedCount === null ? null
    : consumptionUnit === "package" && packageSize
      ? parsedCount * packageSize.amount
      : parsedCount;
  const chosenUnit: PackageUnit = consumptionUnit === "package" && packageSize
    ? packageSize.unit : consumptionUnit === "ml" ? "ml" : "g";
  const portionDirty = !selectedConsumption || calculatedAmount === null ||
    Math.abs(calculatedAmount - selectedConsumption.amount) > 0.0001 ||
    chosenUnit !== selectedConsumption.unit;
  const selectedLabel = selectedConsumption?.description ?? "";

  const updatePortion = React.useCallback(async () => {
    if (!food?.barcode) return;
    const packageReference = parsePackageSize(food.quantity);
    const number = parseGrams(portionInput);
    const actual = number === null ? null
      : consumptionUnit === "package" && packageReference
        ? number * packageReference.amount : number;
    const unit: PackageUnit = consumptionUnit === "package" && packageReference
      ? packageReference.unit : consumptionUnit === "ml" ? "ml" : "g";
    if (actual === null || actual <= 0 || actual > 5000) {
      toast.error("Geçerli bir miktar seçmelisin (en fazla 5000 g/ml).");
      return;
    }
    const nutrients = nutrientsForAmount(food, actual, unit);
    if (!nutrients) {
      toast.error(unit === "ml"
        ? "Bu ürün için güvenilir ml besin referansı yok; ml, grama çevrilerek tahmin yapılamaz."
        : "Bu miktar için güvenilir besin referansı bulunamadı.");
      return;
    }
    setPersonalizing(true);
    try {
      // A declared volume serving is scaled as volume, not via the gram-based API.
      const result = unit === "g" && food.provenance.dataBasis === "PER_100_G"
        ? (await nutritionClient.personalize(food.barcode, actual)).personalization
        : (await nutritionClient.personalizeNutrients(nutrients, food.barcode)).personalization;
      setPersonalization(result);
      setGrams(unit === "g" ? actual : null);
      const descriptor = consumptionUnit === "package"
        ? number + " " + (/maden suyu|şişe|doğal su/i.test(food.displayNameTr || food.name) && unit === "ml" ? "şişe" : "paket")
        : number + " " + unit;
      setSelectedConsumption({ amount: actual, unit, description: descriptor });
      setComparison(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Seçilen miktarın besin hesabı yapılamadı.");
    } finally {
      setPersonalizing(false);
    }
  }, [food, portionInput, consumptionUnit]);

  const compare = React.useCallback(async () => {
    if (!food?.barcode || portionDirty || grams === null || selectedConsumption?.unit !== "g") return;
    setComparing(true);
    try {
      setComparison((await nutritionClient.compare(food.barcode, grams)).comparison);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Karşılaştırma yapılamadı.");
    } finally {
      setComparing(false);
    }
  }, [food, grams, portionDirty, selectedConsumption]);

  const logMeal = React.useCallback(async () => {
    if (!food || !personalization || portionDirty || !selectedConsumption) {
      setConsumptionOpen(true);
      return;
    }
    setLoggingMeal(true);
    try {
      const back = await journey.save((slot, loggedAt) => nutritionClient.logMeal((slot?.toUpperCase() as MealTypeDto) ?? mealType, food, personalization, selectedConsumption, { loggedAt, retryOnUnauthorized: false }));
      if (back) { router.push(back); return; }
      await nutritionClient.logMeal(mealType, food, personalization, selectedConsumption);
      toast.success(selectedConsumption.description + " öğüne eklendi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Öğüne eklenemedi.");
    } finally {
      setLoggingMeal(false);
    }
  }, [food, mealType, personalization, portionDirty, selectedConsumption, journey, router]);

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
  const referenceNutrients = scan?.nutrients.reference ?? (food
    ? food.provenance.dataBasis === "PER_SERVING"
      ? food.nutrientsPerServing ?? null : food.nutrientsPer100g
    : null);
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
                  <div className={`mt-3 grid gap-2 text-xs ${food.quantity ? "sm:grid-cols-2" : ""}`}>
                    {food.quantity && (
                      <div className="rounded-xl bg-primary/5 px-3 py-2">
                        <p className="text-muted-foreground">Paket</p>
                        <p className="mt-0.5 font-bold text-foreground">{food.quantity}</p>
                      </div>
                    )}
                    <div className="rounded-xl bg-primary/5 px-3 py-2">
                      <p className="text-muted-foreground">Besin referansı</p>
                      <p className="mt-0.5 font-bold text-foreground">{referenceLabel} için</p>
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
              {partialProductDataNotice(scan) && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                  {partialProductDataNotice(scan)}
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
              <SectionTitle>2. Ürünün besin değerleri</SectionTitle>
              {packageSize && displayedPackageNutrients ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Paketin tamamı: {food.quantity}</p>
                  <NutritionFactsGrid portion={displayedPackageNutrients} portionLabel={"Toplam " + food.quantity} hideMissing />
                </div>
              ) : (
                <p className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  {packageSize
                    ? "Paket miktarı biliniyor ancak uygun birimle eşleşen güvenilir besin referansı bulunmadığından toplam değer hesaplanmadı."
                    : "Paketin net miktarı doğrulanamadı; toplam kalori ve besin değerleri hesaplanmadı."}
                </p>
              )}
              {volumeSource && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-sm font-semibold">Kaynakta bildirilen hacim porsiyonu</p>
                  <NutritionFactsGrid
                    portion={volumeSource.nutrients}
                    portionLabel={volumeSource.amount + " ml (paket toplamı olmayabilir)"}
                    hideMissing
                  />
                </div>
              )}
              {referenceNutrients && (
                <div className="space-y-2 border-t border-border/60 pt-3">
                  <p className="text-sm font-semibold">Kaynak besin referansı</p>
                  <NutritionFactsGrid portion={referenceNutrients} portionLabel={referenceLabel + " (paket toplamı değil)"} hideMissing />
                </div>
              )}
              {scan?.additionalNutritionReferences.map((reference, index) => (
                <div key={reference.description + index} className="space-y-2 rounded-xl border border-border p-3">
                  <p className="text-xs font-bold">Ek etiket referansı</p>
                  <NutritionFactsGrid portion={reference.nutrients} portionLabel={reference.description} hideMissing />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Paket boyutu, 100 g / kaynak porsiyonu ve tükettiğin miktar ayrı bilgilerdir.
                Sıvılarda 1 ml, 1 g kabul edilmez. Bilinmeyen besin değerleri sıfır olarak gösterilmez.
              </p>
              {!consumptionOpen && (
                <Button
                  className="h-12 w-full rounded-2xl font-bold"
                  onClick={() => { setConsumptionOpen(true); if (packageSize) void updatePortion(); }}
                >
                  <Plus aria-hidden="true" /> Öğüne eklemek için porsiyon seç
                </Button>
              )}
              {consumptionOpen && (
                <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3" id="barcode-consumption-selection">
                  <h3 className="text-sm font-bold">Öğüne eklenecek tüketim miktarı</h3>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="text-xs font-medium" htmlFor="portion-unit">
                      Ölçü birimi
                      <select
                        id="portion-unit"
                        value={consumptionUnit}
                        onChange={(event) => {
                          const unit = event.target.value as "package" | PackageUnit;
                          setConsumptionUnit(unit);
                          setPortionInput(unit === "package" ? "1" : "");
                          setSelectedConsumption(null);
                          setPersonalization(null);
                          setGrams(null);
                        }}
                        className="mt-1 block h-11 w-full rounded-xl border bg-background px-2 text-sm"
                      >
                        {packageSize && <option value="package">{packageSize.unit === "ml" ? "Şişe / paket" : "Paket"}</option>}
                        {food.provenance.dataBasis === "PER_100_G" && <option value="g">Gram (g)</option>}
                        {(volumeSource || packageSize?.unit === "ml") && <option value="ml">Mililitre (ml)</option>}
                      </select>
                    </label>
                    <label className="text-xs font-medium" htmlFor="portion-grams">
                      {consumptionUnit === "package" ? "Paket sayısı" : "Miktar (" + chosenUnit + ")"}
                      <input
                        id="portion-grams"
                        type="text"
                        inputMode="decimal"
                        value={portionInput}
                        placeholder={consumptionUnit === "package" ? "örn. 1 veya 0,5" : "örn. 200"}
                        onChange={(event) => setPortionInput(event.target.value.replace(/[^0-9.,]/g, "").slice(0, 7))}
                        aria-label="Tüketim miktarı"
                        className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-base font-bold tabular-nums"
                      />
                    </label>
                  </div>
                  {packageSize && (
                    <div className="flex flex-wrap gap-2">
                      {[0.5, 1, 2].map((count) => (
                        <Button key={count} variant="outline" size="sm" onClick={() => {
                          setConsumptionUnit("package");
                          setPortionInput(String(count).replace(".", ","));
                        }}>
                          {count === 0.5 ? "Yarım paket" : count === 1 ? "1 paket" : "2 paket"}
                        </Button>
                      ))}
                    </div>
                  )}
                  <Button className="w-full" variant="secondary" onClick={() => void updatePortion()} isLoading={personalizing}>
                    <RefreshCcw aria-hidden="true" /> Miktarı hesapla
                  </Button>
                  {selectedConsumption && !portionDirty && portionNutrients && (
                    <NutritionFactsGrid
                      portion={portionNutrients}
                      portionLabel={selectedLabel + " tüketim"}
                      hideMissing
                    />
                  )}
                  {portionDirty && (
                    <p className="text-xs text-muted-foreground">Öğüne eklemeden önce seçtiğin miktarı hesapla.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <SectionTitle>3. Senin İçin</SectionTitle>
              {personalizing && (
                <p className="text-sm text-muted-foreground">Aktif planın ve bugünkü kayıtlarınla karşılaştırılıyor…</p>
              )}
              {selectedConsumption !== null && !portionDirty && !personalizing && personalization?.metrics && (
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
              {!personalizing && selectedConsumption === null && (
                <div className="flex gap-3 rounded-2xl bg-primary/5 p-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Target className="size-4" aria-hidden="true" />
                  </span>
                  <p className="self-center text-muted-foreground">
                    Tükettiğin miktarı seçtiğinde bu ürünün günlük hedeflerine katkısı burada gösterilir.
                  </p>
                </div>
              )}
              {!personalizing && selectedConsumption !== null && !personalization?.metrics && (
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
                  {productInfoRows(food, scan).map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 px-4 py-2 text-sm">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="break-words text-right font-semibold text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
                {productDataTrustExplanation(scan) && (
                  <p className="border-t bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    {productDataTrustExplanation(scan)}
                  </p>
                )}
                {allergenDataNotice(food) && (
                  <p className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    {allergenDataNotice(food)}
                  </p>
                )}
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
                  onClick={() => {
                    if (!consumptionOpen) { setConsumptionOpen(true); if (packageSize) void updatePortion(); }
                    else void logMeal();
                  }}
                  isLoading={loggingMeal}
                  disabled={loggingMeal || personalizing || !journey.loaded || Boolean(journey.requested && (!journey.valid || journey.entry?.phase !== "open"))}
                >
                  <Plus aria-hidden="true" /> Öğüne ekle
                </Button>
              </div>
              <Button className="h-11 w-full rounded-2xl" variant="outline" onClick={() => void compare()} isLoading={comparing} disabled={grams === null || portionDirty || personalizing || selectedConsumption?.unit !== "g"}>
                <Scale aria-hidden="true" /> Kalori karşılaştır
              </Button>
              <Button className="h-11 w-full rounded-2xl" variant="outline" onClick={() => void addFavorite()} isLoading={favoriting}>
                <Heart aria-hidden="true" /> Favorilere ekle
              </Button>
              {selectedConsumption?.unit === "g" && grams !== null && portionNutrients ? (
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
              {consumptionOpen && portionDirty && (
                <p className="text-center text-xs text-muted-foreground">Öğüne eklemek için tüketim miktarını önce hesapla.</p>
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
                    {comparisonNutritionText(item.nutrients)}
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
