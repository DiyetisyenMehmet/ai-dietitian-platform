"use client";

import * as React from "react";
import { Camera, CheckCircle2, ScanText } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/infrastructure/api/http-client";
import { nutritionClient, type CanonicalFoodDto, type NormalizedNutritionScanDto, type NutrientValuesDto, type PackageLabelDraftDto } from "@/infrastructure/nutrition/nutrition-client";
import { Button } from "@/presentation/components/ui/button";

const NUTRIENTS: readonly [keyof NutrientValuesDto, string, string][] = [
  ["energyKcal", "Enerji", "kcal"], ["proteinG", "Protein", "g"], ["carbohydratesG", "Karbonhidrat", "g"], ["fatG", "Yağ", "g"], ["saturatedFatG", "Doymuş yağ", "g"], ["sugarsG", "Şeker", "g"], ["fiberG", "Lif", "g"], ["saltG", "Tuz", "g"], ["sodiumMg", "Sodyum", "mg"],
];

function splitList(value: string): string[] { return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 80); }
function nullableNumber(value: string): number | null { if (!value.trim()) return null; const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; }

export function PackageLabelRecovery({ barcode, onConfirmed }: { barcode: string; onConfirmed(food: CanonicalFoodDto, scan: NormalizedNutritionScanDto): void }) {
  const [draft, setDraft] = React.useState<PackageLabelDraftDto | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const extract = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) { toast.error("JPG, PNG veya WebP biçiminde, 8 MB'den küçük etiket fotoğrafı seç."); return; }
    setExtracting(true);
    try {
      const result = await nutritionClient.extractPackageLabel(barcode, file);
      setDraft(result.draft);
      toast.success("Etiket okundu. Kaydetmeden önce değerleri kontrol et.");
    } catch (error) { toast.error(error instanceof ApiError ? error.message : "Besin etiketi okunamadı."); }
    finally { setExtracting(false); }
  }, [barcode]);

  const updateNutrient = (key: keyof NutrientValuesDto, value: string) => setDraft((current) => current ? { ...current, nutrients: { ...current.nutrients, [key]: nullableNumber(value) } } : current);

  const confirm = React.useCallback(async () => {
    if (!draft || confirming) return;
    setConfirming(true);
    try {
      const result = await nutritionClient.confirmPackageLabel(barcode, draft);
      onConfirmed(result.food, result.scan);
      toast.success("Etiket doğrulandı ve bu barkod için hesabına kaydedildi.");
    } catch (error) { toast.error(error instanceof ApiError ? error.message : "Etiket kaydedilemedi."); }
    finally { setConfirming(false); }
  }, [barcode, confirming, draft, onConfirmed]);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex gap-3">
        <ScanText className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">Paketteki besin etiketini okut</p>
          <p className="text-xs text-muted-foreground">AI yalnız görünür etiket metnini okur; eksik değer üretmez. Son kayıt sen kontrol edip onayladıktan sonra yalnız kendi hesabında bu barkoda bağlanır.</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()} isLoading={extracting}>
        <Camera /> {draft ? "Etiketi yeniden çek" : "Besin etiketini fotoğraflayıp oku"}
      </Button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={extract} aria-label="Besin etiketi fotoğrafı" />

      {draft && (
        <div className="space-y-4 rounded-xl bg-background p-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">OCR güveni yaklaşık %{Math.round(draft.confidence * 100)}. Tüm alanları ambalajla karşılaştır.</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold">Ürün adı<input className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.productName ?? ""} onChange={(e) => setDraft({ ...draft, productName: e.target.value || null })} /></label>
            <label className="text-xs font-semibold">Marka<input className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.brand ?? ""} onChange={(e) => setDraft({ ...draft, brand: e.target.value || null })} /></label>
            <label className="text-xs font-semibold">Net miktar<input className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.quantity ?? ""} onChange={(e) => setDraft({ ...draft, quantity: e.target.value || null })} /></label>
            <label className="text-xs font-semibold">Besin değerleri bazı<select className="mt-1 w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-normal" value={draft.basis ?? ""} onChange={(e) => setDraft({ ...draft, basis: e.target.value === "PER_100_G" || e.target.value === "PER_SERVING" ? e.target.value : null })}><option value="">Seç</option><option value="PER_100_G">100 g / 100 ml</option><option value="PER_SERVING">Porsiyon</option></select></label>
            <label className="text-xs font-semibold">Porsiyon gramı<input type="number" min={0} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.servingGrams ?? ""} onChange={(e) => setDraft({ ...draft, servingGrams: nullableNumber(e.target.value) })} /></label>
            <label className="text-xs font-semibold">Enerji kJ<input type="number" min={0} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.energyKj ?? ""} onChange={(e) => setDraft({ ...draft, energyKj: nullableNumber(e.target.value) })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {NUTRIENTS.map(([key, label, unit]) => <label key={key} className="text-xs font-semibold">{label} ({unit})<input type="number" min={0} step="any" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.nutrients[key] ?? ""} onChange={(e) => updateNutrient(key, e.target.value)} /></label>)}
          </div>
          <label className="block text-xs font-semibold">İçindekiler<textarea rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.ingredients.join(", ")} onChange={(e) => setDraft({ ...draft, ingredients: splitList(e.target.value) })} /></label>
          <label className="block text-xs font-semibold">Alerjenler<textarea rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-normal" value={draft.allergens.join(", ")} onChange={(e) => setDraft({ ...draft, allergens: splitList(e.target.value) })} /></label>
          {draft.warnings.length > 0 && <div className="text-xs text-muted-foreground">{draft.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
          <Button type="button" className="w-full" onClick={() => void confirm()} isLoading={confirming}><CheckCircle2 /> Etiketi kontrol ettim, bu barkoda kaydet</Button>
        </div>
      )}
    </div>
  );
}
