"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Camera,
  ChevronDown,
  Database,
  ImageUp,
  Images,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCcw,
  ScanLine,
  Utensils,
  X,
} from "lucide-react";

import { ApiError } from "@/infrastructure/api/http-client";
import {
  nutritionClient,
  type PersonalizationContextDto,
} from "@/infrastructure/nutrition/nutrition-client";
import {
  foodScanClient,
  type FoodScanResultDto,
  type MealTypeDto,
} from "@/infrastructure/tracking/food-scan-client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  NutritionAttentionSection,
  NutritionFactsGrid,
} from "./nutrition-scan-sections";

interface EditableIngredient {
  name: string;
  grams: number;
  included: boolean;
}

const MEAL_TYPES: readonly { value: MealTypeDto; label: string }[] = [
  { value: "BREAKFAST", label: "Kahvaltı" },
  { value: "LUNCH", label: "Öğle" },
  { value: "DINNER", label: "Akşam" },
  { value: "SNACK", label: "Ara öğün" },
];

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Görsel analiz edilemedi. Lütfen farklı ve daha net bir fotoğraf dene.";
}

function defaultMealType(): MealTypeDto {
  const hour = new Date().getHours();
  if (hour < 11) return "BREAKFAST";
  if (hour < 16) return "LUNCH";
  if (hour < 22) return "DINNER";
  return "SNACK";
}

function providerLabel(provider: "USDA" | "OPEN_FOOD_FACTS" | "DIEWISH"): string {
  if (provider === "USDA") return "USDA FoodData Central";
  if (provider === "OPEN_FOOD_FACTS") return "Open Food Facts";
  return "Diewish";
}

function resolutionSummary(analysis: FoodScanResultDto): string {
  const method = analysis.nutritionResolution?.method;
  if (method === "AI_ESTIMATE") {
    return "Doğrulanmış kaynak verisi yetersiz olduğu için yaklaşık değerler kullanıldı.";
  }
  if (method === "UNAVAILABLE") {
    return "Besin değerleri için yeterli kaynak bulunamadı.";
  }
  if (method === "COMPONENT_AGGREGATE") {
    return "Besin değerleri eşleşen malzemelerin kaynak verileriyle hesaplandı.";
  }
  if (method === "VERIFIED_SOURCE") {
    return "Besin değerleri doğrulanmış bir kaynakla eşleştirildi.";
  }
  return "Besin değerleri mevcut kaynaklara göre gösterilir.";
}

function sourceSummary(analysis: FoodScanResultDto): { title: string; detail: string } {
  const resolution = analysis.nutritionResolution;
  if (!resolution) {
    return {
      title: "Kaynak bilgisi",
      detail: "Besin değerlerinin kaynak bilgisi bu sonuç için sınırlı.",
    };
  }
  if (resolution.method === "AI_ESTIMATE") {
    return {
      title: "Diewish tahmini",
      detail: "Doğrulanmış kaynak verisi yeterli olmadığı için yaklaşık besin değerleri kullanıldı.",
    };
  }
  if (resolution.method === "UNAVAILABLE") {
    return {
      title: "Kaynak bilgisi bulunamadı",
      detail: "Gıda adını veya porsiyonu düzenleyip yeniden hesaplayabilirsin.",
    };
  }
  const providers = resolution.providers.map(providerLabel);
  const providerText = providers.length > 0 ? providers.join(", ") : "mevcut besin kaynakları";
  return {
    title: resolution.method === "VERIFIED_SOURCE" ? "Doğrulanmış kaynak" : "Kaynak destekli hesaplama",
    detail: resolution.method === "VERIFIED_SOURCE"
      ? `Besin değerleri ${providerText} ile eşleştirildi.`
      : `Besin değerleri eşleşen malzemeler için ${providerText} kullanılarak hesaplandı.`,
  };
}

function visualConfidenceLabel(confidence: number): string {
  if (confidence >= 85) return "yüksek";
  if (confidence >= 65) return "orta";
  return "düşük";
}

function portionDisplayLabel(analysis: FoodScanResultDto, fallbackGrams: number): string {
  const grams = analysis.estimatedGrams ?? fallbackGrams;
  if (analysis.estimatedPortion === "Düzeltilmiş porsiyon" || /kullanıcı porsiyonu/i.test(analysis.estimatedPortion)) {
    return `Seçilen porsiyon: ${grams} g`;
  }
  return `Yaklaşık ${grams} g porsiyon`;
}

function analysisToast(analysis: FoodScanResultDto): string {
  if (analysis.nutritionResolution?.method === "AI_ESTIMATE") {
    return "Yemek tanındı; yaklaşık besin değerleri Diewish tarafından oluşturuldu.";
  }
  if (analysis.nutritionResolution?.method === "UNAVAILABLE") {
    return "Yemek tanındı; gıda adını ve porsiyonu doğrulayarak analizi tamamlayabilirsin.";
  }
  return "Yemek tanındı; besin değerleri güvenilir kaynaklarla hesaplandı.";
}

function coachHref(analysis: FoodScanResultDto): string {
  const grams = analysis.estimatedGrams ?? 100;
  const sourceContext = analysis.nutritionResolution?.method === "AI_ESTIMATE"
    ? "Besin değerlerinin yaklaşık olduğunu ve doğrulanmış kaynak verisinin yetersiz olduğunu dikkate al."
    : "Kullanılan besin değerlerinin kaynak bilgisini dikkate al.";
  const prompt = `${grams} g ${analysis.dishName} ve günlük hedeflerim açısından benim için ne ifade ediyor? Fotoğraftaki tarif ve porsiyonun tahmini olduğunu dikkate al. ${sourceContext}`;
  return `/ai?prompt=${encodeURIComponent(prompt)}`;
}

function sumIncluded(ingredients: EditableIngredient[]): number {
  return Math.round(
    ingredients.filter((item) => item.included).reduce((sum, item) => sum + item.grams, 0) * 10,
  ) / 10;
}

export function FoodScannerView() {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [analysis, setAnalysis] = React.useState<FoodScanResultDto | null>(null);
  const [personalization, setPersonalization] = React.useState<PersonalizationContextDto | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [personalizing, setPersonalizing] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [recalculating, setRecalculating] = React.useState(false);
  const [ingredients, setIngredients] = React.useState<EditableIngredient[]>([]);
  const [targetGrams, setTargetGrams] = React.useState(100);
  const [mealType, setMealType] = React.useState<MealTypeDto>(() => defaultMealType());
  const [loggingMeal, setLoggingMeal] = React.useState(false);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const personalizationRequestRef = React.useRef(0);

  const syncEditable = React.useCallback((value: FoodScanResultDto) => {
    const editable = value.ingredients.map((item) => ({
      name: item.name,
      grams: item.estimatedGrams ?? 1,
      included: item.included,
    }));
    setIngredients(editable);
    const inferred = value.estimatedGrams ?? sumIncluded(editable);
    setTargetGrams(Math.max(1, Math.min(5000, inferred || 100)));
  }, []);

  const loadPersonalization = React.useCallback(async (value: FoodScanResultDto) => {
    const requestId = ++personalizationRequestRef.current;
    setPersonalizing(true);
    try {
      const result = await nutritionClient.personalizeNutrients(value.totals);
      if (requestId === personalizationRequestRef.current) {
        setPersonalization(result.personalization);
      }
    } catch {
      if (requestId === personalizationRequestRef.current) setPersonalization(null);
    } finally {
      if (requestId === personalizationRequestRef.current) setPersonalizing(false);
    }
  }, []);

  const clearSelection = React.useCallback(() => {
    personalizationRequestRef.current += 1;
    setPreview(null);
    setFile(null);
    setAnalysis(null);
    setPersonalization(null);
    setIngredients([]);
    setTargetGrams(100);
    setEditing(false);
    setPersonalizing(false);
  }, []);

  const onPick = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      toast.error("JPG, PNG veya WebP biçiminde bir fotoğraf seç.");
      return;
    }
    if (selected.size > 8 * 1024 * 1024) {
      toast.error("Görsel 8 MB'den küçük olmalı.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      personalizationRequestRef.current += 1;
      setPreview(String(reader.result));
      setFile(selected);
      setAnalysis(null);
      setPersonalization(null);
      setIngredients([]);
      setTargetGrams(100);
      setEditing(false);
      setPersonalizing(false);
    };
    reader.readAsDataURL(selected);
  }, []);

  const onAnalyze = React.useCallback(async () => {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setPersonalization(null);
    try {
      const result = await foodScanClient.analyze(file);
      setAnalysis(result.analysis);
      syncEditable(result.analysis);
      void loadPersonalization(result.analysis);
      toast.success(analysisToast(result.analysis));
    } catch (error) {
      toast.error("Bu görsel analiz edilemedi", { description: friendlyError(error) });
    } finally {
      setAnalyzing(false);
    }
  }, [file, analyzing, loadPersonalization, syncEditable]);

  const onRecalculate = React.useCallback(async () => {
    if (!analysis || recalculating) return;
    setRecalculating(true);
    try {
      const result = await foodScanClient.recalculate(ingredients, targetGrams, analysis.dishName);
      const next: FoodScanResultDto = {
        ...analysis,
        ...result.analysis,
        estimatedPortion: "Düzeltilmiş porsiyon",
      };
      setAnalysis(next);
      syncEditable(next);
      setEditing(false);
      void loadPersonalization(next);
      toast.success(analysisToast(next));
    } catch (error) {
      toast.error("Yeniden hesaplanamadı", { description: friendlyError(error) });
    } finally {
      setRecalculating(false);
    }
  }, [analysis, ingredients, loadPersonalization, recalculating, syncEditable, targetGrams]);

  const onLogMeal = React.useCallback(async () => {
    if (!analysis || loggingMeal) return;
    setLoggingMeal(true);
    try {
      await foodScanClient.logMeal(mealType, analysis);
      toast.success("Öğüne eklendi.");
    } catch (error) {
      toast.error("Öğün eklenemedi", { description: friendlyError(error) });
    } finally {
      setLoggingMeal(false);
    }
  }, [analysis, loggingMeal, mealType]);

  const source = analysis ? sourceSummary(analysis) : null;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ScanLine className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold">Fotoğrafla Tara</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Diewish yemeği, yaklaşık porsiyonu ve muhtemel malzemeleri belirler. Besin değerleri güvenilir kaynaklarla eşleştirilir; kaynak yetersizse yaklaşık değer açıkça belirtilir.
            </p>
          </div>
        </div>
      </section>

      <Card>
        <CardContent className="p-5">
          {preview ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Seçilen yemek" className="h-56 w-full object-cover" />
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={analyzing}
                  className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/85 shadow"
                  aria-label="Görseli kaldır"
                >
                  <X className="size-4" />
                </button>
              </div>
              <Button className="w-full" onClick={() => void onAnalyze()} isLoading={analyzing} disabled={analyzing}>
                {!analyzing && <ScanLine aria-hidden="true" />} {analyzing ? "Yemek tanınıyor" : "Görseli analiz et"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={analyzing}
                  onClick={() => cameraInputRef.current?.click()}
                  aria-label="Kamerayla yeni yemek fotoğrafı çek"
                >
                  <Camera aria-hidden="true" /> Yeniden çek
                </Button>
                <Button
                  variant="outline"
                  disabled={analyzing}
                  onClick={() => galleryInputRef.current?.click()}
                  aria-label="Galeriden başka yemek fotoğrafı seç"
                >
                  <Images aria-hidden="true" /> Galeriden değiştir
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed p-6 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ImageUp className="size-7" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold">Yemeğinin fotoğrafını ekle</p>
              <p className="mt-1 text-xs text-muted-foreground">Net bir fotoğraf çek veya daha önce çektiğin bir görseli galeriden seç.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full"
                  aria-label="Kamerayla yemek fotoğrafı çek"
                >
                  <Camera aria-hidden="true" /> Kamerayla çek
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full"
                  aria-label="Galeriden yemek fotoğrafı seç"
                >
                  <Images aria-hidden="true" /> Galeriden seç
                </Button>
              </div>
            </div>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={onPick}
            aria-label="Kamera fotoğraf girişi"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onPick}
            aria-label="Galeri fotoğraf girişi"
          />
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardContent className="space-y-6 p-5">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">1. Bu ne?</p>
              <div className="mt-1">
                <h3 className="break-words text-xl font-bold">{analysis.dishName}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {analysis.estimatedPortion}
                  {analysis.estimatedGrams ? ` · yaklaşık ${analysis.estimatedGrams} g` : ""}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Görsel eşleşme: {visualConfidenceLabel(analysis.confidence)}
                </span>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">2. Besin değerleri</p>
                  <p className="text-xs text-muted-foreground">{resolutionSummary(analysis)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing((value) => !value)}>
                  <Pencil /> Malzemeleri Düzenle
                </Button>
              </div>
              <div className="mt-3">
                <NutritionFactsGrid
                  portion={analysis.totals}
                  portionLabel={portionDisplayLabel(analysis, targetGrams)}
                />
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">3. Ne yapabilirsin?</p>
              <div className="mt-2 grid gap-2">
                <select
                  value={mealType}
                  onChange={(event) => setMealType(event.target.value as MealTypeDto)}
                  className="min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  aria-label="Öğün seçimi"
                >
                  {MEAL_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <Button
                  className="min-h-11 w-full"
                  onClick={() => void onLogMeal()}
                  isLoading={loggingMeal}
                  aria-label="Seçilen porsiyonu öğüne ekle"
                >
                  <Utensils /> Öğüne ekle
                </Button>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="outline" className="min-h-11">
                    <Link href={coachHref(analysis)}><MessageCircle /> Diewish Koç&apos;a sor</Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11">
                    <Link href="/meals/add"><Plus /> Öğünü elle ekle</Link>
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-sm font-semibold">Muhtemel malzemeler</p>
              {editing && (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <label className="text-xs font-semibold" htmlFor="photo-target-grams">Toplam porsiyon</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="photo-target-grams"
                      type="number"
                      min={1}
                      max={5000}
                      value={targetGrams}
                      onChange={(event) => setTargetGrams(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
                      className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                    />
                    <span className="text-sm">g</span>
                    <span className="text-xs text-muted-foreground">Malzeme miktarları toplam porsiyona göre birlikte güncellenir.</span>
                  </div>
                </div>
              )}

              {(editing ? ingredients : analysis.ingredients).map((item, index) => {
                const display = analysis.ingredients[index];
                if (editing) {
                  const editable = item as EditableIngredient;
                  return (
                    <div key={`${editable.name}-${index}`} className="grid grid-cols-[auto_1fr_90px] items-center gap-2 rounded-xl border p-3">
                      <input
                        type="checkbox"
                        checked={editable.included}
                        onChange={(event) => setIngredients((current) => current.map((entry, i) => i === index ? { ...entry, included: event.target.checked } : entry))}
                        aria-label={`${editable.name} dahil`}
                      />
                      <input
                        value={editable.name}
                        onChange={(event) => setIngredients((current) => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))}
                        className="min-w-0 rounded-lg border px-2 py-1.5 text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          value={editable.grams}
                          onChange={(event) => setIngredients((current) => current.map((entry, i) => i === index ? { ...entry, grams: Number(event.target.value) || 1 } : entry))}
                          className="w-16 rounded-lg border px-2 py-1.5 text-sm"
                        />
                        <span className="text-xs">g</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={`${display?.name ?? index}`} className="rounded-xl border p-3 text-sm">
                    <p className="break-words font-semibold">{display?.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{display?.estimatedGrams ? `~${display.estimatedGrams} g` : "Miktar belirsiz"}</span>
                      {display?.optional && <span>Muhtemel içerik</span>}
                      <span>Görsel eşleşme: {visualConfidenceLabel(display?.confidence ?? 0)}</span>
                    </div>
                  </div>
                );
              })}
              {editing && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIngredients((current) => [...current, { name: "", grams: 10, included: true }])}
                  >
                    <Plus /> Malzeme ekle
                  </Button>
                  <Button className="flex-1" onClick={() => void onRecalculate()} isLoading={recalculating}>
                    <RefreshCcw /> Yeniden hesapla
                  </Button>
                </div>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">4. Senin İçin</p>
              {personalizing && <p className="mt-2 text-sm text-muted-foreground">Aktif planın ve bugünkü kayıtlarınla karşılaştırılıyor…</p>}
              {!personalizing && personalization?.metrics && (
                <div className="mt-2 space-y-2">
                  {personalization.metrics.lines.map((line) => (
                    <p key={line} className="rounded-xl bg-primary/5 p-3 text-sm">{line}</p>
                  ))}
                </div>
              )}
              {!personalizing && personalization && !personalization.metrics && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Aktif bir beslenme planın olduğunda bu öğünün günlük hedeflerine katkısı burada gösterilir.
                </p>
              )}
              {!personalizing && !personalization && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Kişisel değerlendirme şu anda alınamadı; yukarıdaki besin değerleri bundan etkilenmez.
                </p>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">5. Dikkat edilebilecekler</p>
              <div className="mt-2">
                <NutritionAttentionSection
                  flags={personalization?.attentionFlags ?? []}
                  warnings={personalization?.warnings}
                />
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">6. Veri kaynağı</p>
              <div className="mt-2 rounded-2xl border bg-muted/15 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                    <Database className="size-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{source?.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{source?.detail}</p>
                  </div>
                </div>
                <details className="group mt-3 border-t pt-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-foreground">
                    Hesaplama notu
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{analysis.disclaimer}</p>
                </details>
              </div>
            </section>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
