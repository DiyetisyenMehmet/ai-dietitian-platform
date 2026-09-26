"use client";

import type * as React from "react";
import {
  Activity,
  AlertTriangle,
  Database,
  Droplet,
  Dumbbell,
  Flame,
  Info,
  Leaf,
  Wheat,
  Zap,
} from "lucide-react";

import type {
  NutrientValuesDto,
  NutritionAttentionFlagDto,
  NutritionProvenanceDto,
} from "@/infrastructure/nutrition/nutrition-client";

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "Bilgi bulunamadı";
  if (unit === "kcal") return `${Math.round(value)} ${unit}`;
  if (unit === "mg") return `${Math.round(value)} ${unit}`;
  const rounded = Math.round(value * (Math.abs(value) < 1 ? 100 : 10)) / (Math.abs(value) < 1 ? 100 : 10);
  return `${rounded} ${unit}`;
}

function providerLabel(source: NutritionProvenanceDto): string {
  if (source.provider === "OPEN_FOOD_FACTS") return "Open Food Facts";
  if (source.provider === "USDA") return "USDA FoodData Central";
  if (source.sourceReference === "USER_CONFIRMED_PACKAGE_LABEL") {
    return "Diewish · kullanıcı doğrulamalı paket etiketi";
  }
  return "Diewish";
}

type NutrientIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

function SugarCubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3 7 4-7 4-7-4 7-4Z" />
      <path d="m5 7 7 4 7-4v9l-7 4-7-4V7Z" />
      <path d="M12 11v9" />
    </svg>
  );
}

function SaltShakerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4h6" />
      <path d="M10 7h4" />
      <path d="M8 10h8l1 9H7l1-9Z" />
      <path d="M10 4v3M12 4v3M14 4v3" />
    </svg>
  );
}

const NUTRIENTS: readonly [
  keyof NutrientValuesDto,
  string,
  string,
  NutrientIcon,
  string,
][] = [
  ["proteinG", "Protein", "g", Dumbbell, "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"],
  ["carbohydratesG", "Karbonhidrat", "g", Wheat, "bg-amber-500/10 text-amber-600 dark:text-amber-300"],
  ["fatG", "Yağ", "g", Droplet, "bg-orange-500/10 text-orange-600 dark:text-orange-300"],
  ["saturatedFatG", "Doymuş yağ", "g", Flame, "bg-rose-500/10 text-rose-600 dark:text-rose-300"],
  ["fiberG", "Lif", "g", Leaf, "bg-green-500/10 text-green-600 dark:text-green-300"],
  ["sugarsG", "Şeker", "g", SugarCubeIcon, "bg-blue-500/10 text-blue-600 dark:text-blue-300"],
  ["saltG", "Tuz", "g", SaltShakerIcon, "bg-violet-500/10 text-violet-600 dark:text-violet-300"],
  ["sodiumMg", "Sodyum", "mg", Activity, "bg-teal-500/10 text-teal-600 dark:text-teal-300"],
];

export function NutritionFactsGrid({
  portion,
  portionLabel,
}: {
  portion: NutrientValuesDto;
  portionLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-primary/5 p-4">
        <Leaf
          className="absolute -bottom-6 -right-3 size-28 rotate-[-18deg] text-primary/[0.07]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Zap className="size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Enerji</p>
            <p className="break-words text-3xl font-extrabold leading-none tracking-tight text-foreground">
              {formatValue(portion.energyKcal, "kcal")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{portionLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {NUTRIENTS.map(([key, label, unit, Icon, iconClass]) => (
          <div key={key} className="flex min-h-[78px] items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}
              aria-hidden="true"
            >
              <Icon className="size-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="break-words text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</p>
              <p className="break-words text-lg font-bold leading-tight text-foreground">
                {formatValue(portion[key], unit)}
              </p>
            </div>
          </div>
        ))}
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
      <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
          <Info className="size-3.5" />
        </span>
        <span>Ek bir uyarı bulunmuyor.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {flags.map((flag) => (
        <div
          key={`${flag.code}-${flag.basis}`}
          className={`flex gap-3 rounded-2xl border p-3.5 text-sm ${
            flag.severity === "WATCH"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-muted/35"
          }`}
        >
          <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${flag.severity === "WATCH" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
            {flag.severity === "WATCH" ? (
              <AlertTriangle className="size-4" aria-hidden="true" />
            ) : (
              <Info className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{flag.message}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {flag.basis === "PER_100_G" ? "100 g bazlı değerlendirme" : "Seçilen porsiyon bazlı değerlendirme"}
            </p>
          </div>
        </div>
      ))}
      {warnings?.map((warning) => (
        <div key={warning} className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-sm">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 font-medium text-foreground">{warning}</span>
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

function confidenceText(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return `%${Math.round(value * 100)}`;
}

export function NutritionProvenanceSection({ sources }: { sources: NutritionProvenanceDto[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {sources.map((source) => {
        const validated = dateText(source.lastValidatedAt ?? source.retrievedAt);
        const updated = dateText(source.providerUpdatedAt);
        const confidence = confidenceText(source.confidence);
        return (
          <div key={`${source.provider}-${source.externalId}`} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Database className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground">{providerLabel(source)}</p>
                {source.stale && (
                  <span className="mt-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Son doğrulanmış kayıt
                  </span>
                )}
              </div>
            </div>
            <dl className="mt-3 divide-y text-xs">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3 py-1.5">
                <dt className="text-muted-foreground">Kaynak kodu</dt>
                <dd className="break-all font-medium text-foreground">{source.externalId}</dd>
              </div>
              {validated && (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3 py-1.5">
                  <dt className="text-muted-foreground">Diewish son doğrulama</dt>
                  <dd className="font-medium text-foreground">{validated}</dd>
                </div>
              )}
              {updated && (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3 py-1.5">
                  <dt className="text-muted-foreground">Kaynak son güncelleme</dt>
                  <dd className="font-medium text-foreground">{updated}</dd>
                </div>
              )}
              {confidence && (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3 py-1.5">
                  <dt className="text-muted-foreground">Güven</dt>
                  <dd className="font-medium text-foreground">{confidence}</dd>
                </div>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
