"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  Camera,
  ImageUp,
  Images,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCcw,
  ScanLine,
  Sparkles,
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

function resolutionSummary(analysis: FoodScanResultDto): string {
  const resolution = analysis.nutritionResolution;
  if (!resolution) return "Besin değerlerinin kaynağı ve belirsizlik düzeyi aşağıda gösterilir.";
  if (resolution.method === "AI_ESTIMATE") {
    return `Diewish AI tahmini · güven yaklaşık %${Math.round(resolution.confidence * 100)}. ${resolution.note}`;
  }
  return resolution.note;
}

function analysisToast(analysis: FoodScanResultDto): string {
  if (analysis.nutritionResolution?.method === "AI_ESTIMATE") {
    return "Yemek tanındı; besin değerleri açıkça etiketlenmiş Diewish AI tahminiyle tamamlandı.";
  }
  if (analysis.nutritionResolution?.method === "UNAVAILABLE") {
    return "Yemek tanındı; gıda adını ve porsiyonu doğrulayarak analizi tamamlayabilirsin.";
  }
  return "Yemek tanındı; besin değerleri güvenilir kaynaklar ve tarif bileşimiyle hesaplandı.";
}

function unmatchedIngredientLabel(analysis: FoodScanResultDto): string {
  if (analysis.nutritionResolution?.method === "AI_ESTIMATE") return "AI tarif tahminine dahil";
  if (analysis.nutritionResolution?.method === "UNAVAILABLE") return "Adını doğrulayarak geliştir";
  return "Toplam hesap diğer kaynaklı bileşenlerden";
}

function unmatchedIngredientSource(analysis: FoodScanResultDto): string {
  if (analysis.nutritionResolution?.method === "AI_ESTIMATE") {
    return "Diewish AI tarif tahmini; doğrulanmış kaynak değildir";
  }
  if (analysis.nutritionResolution?.method === "UNAVAILABLE") {
    return "Gıda adı/porsiyon doğrulamasıyla yeniden çözümlenebilir";
  }
  return "Bu bileşen için ayrı kaynak kullanılmadı; toplam yalnız kaynaklı bileşenlerden hesaplandı";
}

function coachHref(analysis: FoodScanResultDto): string {
  const grams = analysis.estimatedGrams ?? 100;
  const sourceContext = analysis.nutritionResolution?.method === "AI_ESTIMATE"
    ? "Besin değerlerinin Diewish AI tahmini olduğunu ve doğrulanmış kaynak olmadığını dikkate al."
    : "Kullanılan besin verilerinin kaynak/provenance bilgisini dikkate al.";
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
              AI yemeği, porsiyonu ve muhtemel malzemeleri tanır. Diewish önce güvenilir besin kaynakları ve tarif bileşimiyle hesaplar; yeterli veri yoksa son çare AI tahmini açıkça etiketlenir.
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
                {!analyzing && <Sparkles aria-hidden="true" />} {analyzing ? "Yemek tanınıyor" : "Görseli analiz et"}
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
              <div className="mt-1 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">{analysis.dishName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {analysis.estimatedPortion}
                    {analysis.estimatedGrams ? ` · yaklaşık ${analysis.estimatedGrams} g` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  Görsel güveni %{Math.round(analysis.confidence)}
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
                  portionLabel={`${analysis.estimatedGrams ?? targetGrams} g tahmini/düzeltilmiş porsiyon`}
                />
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
                    <span className="text-xs text-muted-foreground">Malzeme gramları sunucuda oransal ve deterministik ölçeklenir.</span>
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
                const matched = Boolean(display?.matchedFood);
                const estimated = analysis.nutritionResolution?.method === "AI_ESTIMATE";
                return (
                  <div key={`${display?.name ?? index}`} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                    <div>
                      <p className="font-semibold">{display?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {display?.estimatedGrams ? `~${display.estimatedGrams} g` : "Miktar belirsiz"} · görsel güveni %{Math.round(display?.confidence ?? 0)}
                        {display?.optional ? " · muhtemel" : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${matched ? "text-emerald-600" : estimated ? "text-violet-600" : "text-muted-foreground"}`}>
                      {display?.matchedFood ? `${display.matchedFood.provider} ile eşleşti` : unmatchedIngredientLabel(analysis)}
                    </span>
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
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">3. Senin İçin</p>
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
                  Kişisel değerlendirme şu anda alınamadı; yukarıdaki besin çözümü bundan etkilenmez.
                </p>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">4. Dikkat edilebilecekler</p>
              <div className="mt-2">
                <NutritionAttentionSection
                  flags={personalization?.attentionFlags ?? []}
                  warnings={personalization?.warnings}
                />
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">5. Kaynak ve belirsizlik</p>
              {analysis.nutritionResolution && (
                <div className={`mt-2 rounded-xl border p-3 text-xs ${analysis.nutritionResolution.method === "AI_ESTIMATE" ? "border-violet-500/30 bg-violet-500/5" : "bg-muted/20"}`}>
                  <p className="font-semibold">
                    {analysis.nutritionResolution.method === "AI_ESTIMATE" ? "Diewish AI tahmini" : "Besin veri çözümü"}
                  </p>
                  <p className="mt-1 text-muted-foreground">{analysis.nutritionResolution.note}</p>
                </div>
              )}
              <div className="mt-2 space-y-2">
                {analysis.ingredients.filter((item) => item.included).map((item) => (
                  <div key={`${item.name}-${item.matchedFood?.externalId ?? "unmatched"}`} className="rounded-xl border p-3 text-xs">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-muted-foreground">
                      Görsel tahmini: %{Math.round(item.confidence)} · {item.optional ? "muhtemel içerik" : "ana içerik adayı"}
                    </p>
                    <p className="text-muted-foreground">
                      Besin çözümü: {item.matchedFood ? `${item.matchedFood.provider} (${item.matchedFood.displayNameTr})` : unmatchedIngredientSource(analysis)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <AlertCircle className="size-4 shrink-0 text-amber-600" />
                <p>{analysis.disclaimer}</p>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">6. Ne yapabilirsin?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="flex gap-2">
                  <select
                    value={mealType}
                    onChange={(event) => setMealType(event.target.value as MealTypeDto)}
                    className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    {MEAL_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <Button onClick={() => void onLogMeal()} isLoading={loggingMeal}><Utensils /> Öğüne ekle</Button>
                </div>
                <Button asChild variant="outline">
                  <Link href={coachHref(analysis)}><MessageCircle /> AI Koç&apos;a sor</Link>
                </Button>
              </div>
            </section>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-sm text-muted-foreground">İstersen öğününü tamamen elle de girebilirsin.</p>
          <Button asChild variant="outline" className="w-full"><Link href="/meals/add"><Plus /> Öğünü elle ekle</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
