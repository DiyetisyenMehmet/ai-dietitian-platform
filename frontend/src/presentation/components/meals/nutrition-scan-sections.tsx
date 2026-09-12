"use client";

import { AlertTriangle, Database, Info } from "lucide-react";

import type {
  NutrientValuesDto,
  NutritionAttentionFlagDto,
  NutritionProvenanceDto,
} from "@/infrastructure/nutrition/nutrition-client";

function value(value: number | null, unit: string): string {
  return value === null ? "—" : `${Math.round(value * 10) / 10} ${unit}`;
}

function providerLabel(source: NutritionProvenanceDto): string {
  if (source.provider === "OPEN_FOOD_FACTS") return "Open Food Facts";
  if (source.provider === "USDA") return "USDA FoodData Central";
  if (source.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL") {
    return "Diewish · kullanıcı doğrulamalı paket etiketi";
  }
  return "Diewish";
}

const NUTRIENTS: readonly [keyof NutrientValuesDto, string, string][] = [
  ["energyKcal", "Enerji", "kcal"],
  ["proteinG", "Protein", "g"],
  ["carbohydratesG", "Karbonhidrat", "g"],
  ["fatG", "Yağ", "g"],
  ["saturatedFatG", "Doymuş yağ", "g"],
  ["fiberG", "Lif", "g"],
  ["sugarsG", "Şeker", "g"],
  ["saltG", "Tuz", "g"],
  ["sodiumMg", "Sodyum", "mg"],
];

export function NutritionFactsGrid({
  per100g,
  portion,
  portionLabel,
}: {
  per100g?: NutrientValuesDto | null;
  portion: NutrientValuesDto;
  portionLabel: string;
}) {
  return (
    <div className="space-y-3">
      {per100g && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">100 g / 100 ml bazında</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {NUTRIENTS.map(([key, label, unit]) => (
              <div key={`100-${key}`} className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold">{value(per100g[key], unit)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{portionLabel}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {NUTRIENTS.map(([key, label, unit]) => (
            <div key={`portion-${key}`} className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-semibold">{value(portion[key], unit)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NutritionAttentionSection({
  flags,
  warnings,
}: {
  flags: NutritionAttentionFlagDto[];
  warnings?: string[];
}) {
  if (flags.length === 0 && (!warnings || warnings.length === 0)) {
    return (
      <p className="text-sm text-muted-foreground">
        Mevcut değerlerle ayrıca işaretlenmesi gereken bir durum görünmüyor. Sayısal değeri olmayan alanlar değerlendirme dışında tutulur.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {flags.map((flag) => (
        <div
          key={`${flag.code}-${flag.basis}`}
          className={`flex gap-2 rounded-xl border p-3 text-sm ${
            flag.severity === "WATCH" ? "border-amber-500/30 bg-amber-500/5" : "bg-muted/40"
          }`}
        >
          {flag.severity === "WATCH" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <p>{flag.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {flag.basis === "PER_100_G" ? "100 g bazlı deterministik kural" : "Seçilen porsiyon bazlı deterministik kural"}
            </p>
          </div>
        </div>
      ))}
      {warnings?.map((warning) => (
        <div key={warning} className="flex gap-2 rounded-xl border border-amber-500/30 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

function dateText(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("tr-TR");
}

export function NutritionProvenanceSection({ sources }: { sources: NutritionProvenanceDto[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-2">
      {sources.map((source) => {
        const validated = dateText(source.lastValidatedAt ?? source.retrievedAt);
        const updated = dateText(source.providerUpdatedAt);
        return (
          <div key={`${source.provider}-${source.externalId}`} className="rounded-xl border p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Database className="size-4" />
              <span>{providerLabel(source)}</span>
              {source.stale && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">önbellek</span>}
            </div>
            <p className="mt-1">Kaynak kimliği: {source.externalId}</p>
            {validated && <p>Diewish son doğrulama: {validated}</p>}
            {updated && <p>Kaynak son güncelleme: {updated}</p>}
            <p>Güven: %{Math.round(source.confidence * 100)}</p>
          </div>
        );
      })}
    </div>
  );
}
