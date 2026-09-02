"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, ImageUp, Plus, ScanLine, Sparkles, X } from "lucide-react";

import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { ApiError } from "@/infrastructure/api/http-client";
import {
  foodScanClient,
  type FoodScanResultDto,
} from "@/infrastructure/tracking/food-scan-client";

const STEPS: readonly { icon: React.ComponentType<{ className?: string }>; title: string; text: string }[] = [
  {
    icon: Camera,
    title: "Fotoğrafını çek",
    text: "Tabağının net bir fotoğrafını çek ya da galerinden bir görsel seç.",
  },
  {
    icon: ScanLine,
    title: "Önce görsel doğrulansın",
    text: "Boş, alakasız veya besin içermeyen görseller analiz başlamadan reddedilir.",
  },
  {
    icon: Sparkles,
    title: "Yaklaşık besin analizi",
    text: "Besinler tanınır; porsiyon, kalori ve makrolar yaklaşık olarak tahmin edilir.",
  },
];

function fmt(value: number | null, suffix: string): string {
  return value === null ? "—" : `${Math.round(value).toLocaleString("tr-TR")} ${suffix}`;
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === "NOT_A_FOOD_IMAGE" ||
      error.code === "FOOD_IMAGE_BLANK" ||
      error.code === "FOOD_IMAGE_TOO_SMALL" ||
      error.code === "FOOD_IMAGE_UNREADABLE"
    ) {
      return error.message;
    }
    if (error.code === "AI_NOT_CONFIGURED") {
      return "Besin görsel analiz motoru henüz sunucuda yapılandırılmamış.";
    }
    if (error.status === 429) return "Çok fazla görsel analizi denendi. Lütfen biraz sonra tekrar dene.";
    return error.message;
  }
  return "Görsel analiz edilemedi. Lütfen farklı ve daha net bir fotoğraf dene.";
}

/** Real food scanner: validates food presence before returning visual estimates. */
export function FoodScannerView() {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [analysis, setAnalysis] = React.useState<FoodScanResultDto | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const clearSelection = React.useCallback(() => {
    setPreview(null);
    setFileName(null);
    setFile(null);
    setAnalysis(null);
  }, []);

  const onPick = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seç.");
      return;
    }
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
      setPreview(String(reader.result));
      setFileName(selected.name);
      setFile(selected);
      setAnalysis(null);
    };
    reader.readAsDataURL(selected);
  }, []);

  const onAnalyze = React.useCallback(async () => {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await foodScanClient.analyze(file);
      setAnalysis(result.analysis);
      toast.success("Besin görseli doğrulandı ve analiz edildi.");
    } catch (error) {
      toast.error("Bu görsel analiz edilemedi", { description: friendlyError(error) });
    } finally {
      setAnalyzing(false);
    }
  }, [file, analyzing]);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ScanLine className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">Besin Tarayıcı</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Fotoğraf önce besin içerip içermediği açısından doğrulanır. Besin tespit edilirse
              porsiyon, kalori ve makrolar yaklaşık olarak hesaplanır.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Görsel seç</h3>
        <Card>
          <CardContent className="p-5">
            {preview ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Seçilen görsel" className="h-56 w-full object-cover" />
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={analyzing}
                    className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background disabled:opacity-50"
                    aria-label="Görseli kaldır"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                {fileName && <p className="truncate text-xs text-muted-foreground">{fileName}</p>}
                <Button className="w-full" onClick={() => void onAnalyze()} isLoading={analyzing} disabled={analyzing}>
                  {!analyzing && <Sparkles aria-hidden="true" />}
                  {analyzing ? "Görsel doğrulanıyor ve analiz ediliyor" : "Görseli analiz et"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={analyzing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageUp aria-hidden="true" />
                  Başka görsel seç
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ImageUp className="size-7" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold">Fotoğraf çek veya galeriden seç</span>
                <span className="text-xs text-muted-foreground">
                  Yemeğin ya da içeceğin net göründüğü bir fotoğraf yükle
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={onPick}
            />
          </CardContent>
        </Card>
      </section>

      {analysis && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Analiz sonucu</h3>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Besin güveni %{Math.round(analysis.confidence)}
            </span>
          </div>

          <Card>
            <CardContent className="space-y-4 p-5">
              <ul className="space-y-3">
                {analysis.items.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.estimatedPortion}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {fmt(item.calories, "kcal")}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-muted-foreground">Protein</p>
                        <p className="font-semibold">{fmt(item.proteinG, "g")}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-muted-foreground">Karbonhidrat</p>
                        <p className="font-semibold">{fmt(item.carbsG, "g")}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-muted-foreground">Yağ</p>
                        <p className="font-semibold">{fmt(item.fatG, "g")}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {analysis.totals && (
                <div className="rounded-2xl bg-primary/5 p-4">
                  <p className="text-sm font-semibold">Toplam yaklaşık değer</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <span>{fmt(analysis.totals.calories, "kcal")}</span>
                    <span>Protein {fmt(analysis.totals.proteinG, "g")}</span>
                    <span>Karbonhidrat {fmt(analysis.totals.carbsG, "g")}</span>
                    <span>Yağ {fmt(analysis.totals.fatG, "g")}</span>
                  </div>
                </div>
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">{analysis.disclaimer}</p>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Nasıl çalışır?</h3>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Görsel tahmininden emin değilsen öğününü elle girerek miktarları kendin düzeltebilirsin.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/meals/add">
              <Plus aria-hidden="true" />
              Öğünü elle ekle
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
