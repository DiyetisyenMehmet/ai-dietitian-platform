"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, ImageUp, Plus, ScanLine, Sparkles, X } from "lucide-react";

import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

const STEPS: readonly { icon: React.ComponentType<{ className?: string }>; title: string; text: string }[] = [
  {
    icon: Camera,
    title: "Fotoğrafını çek",
    text: "Tabağının net bir fotoğrafını çek ya da galerinden bir görsel seç.",
  },
  {
    icon: ScanLine,
    title: "Koçun analiz etsin",
    text: "Görsel tanıma, besinleri ve tahmini porsiyonları otomatik tespit edecek.",
  },
  {
    icon: Sparkles,
    title: "Kalori & makro tahmini",
    text: "Kalori ve makro değerleri öğün günlüğüne saniyeler içinde eklenecek.",
  },
];

/**
 * Food scanner — a polished, architecture-ready preview of the AI photo
 * analysis feature. The image-selection UI works today; the recognition step
 * is wired to a clear placeholder until the AI pipeline is enabled.
 */
export function FoodScannerView() {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const onPick = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seç.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Görsel 8 MB'den küçük olmalı.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const onAnalyze = React.useCallback(() => {
    toast.info("Görsel analizi çok yakında", {
      description: "Bu sürümde öğününü elle ekleyebilirsin; tanıma motoru hazırlanıyor.",
    });
  }, []);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent to-background p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ScanLine className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">Besin Tarayıcı</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Yemeğinin fotoğrafını çek, koçun besinleri tanısın ve kalori ile makroları senin için
              hesaplasın.
            </p>
          </div>
        </div>
      </section>

      {/* Image selection */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Görsel seç</h3>
        <Card>
          <CardContent className="p-5">
            {preview ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Seçilen yemek" className="h-56 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setFileName(null);
                    }}
                    className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                    aria-label="Görseli kaldır"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                {fileName && <p className="truncate text-xs text-muted-foreground">{fileName}</p>}
                <Button className="w-full" onClick={onAnalyze}>
                  <Sparkles aria-hidden="true" />
                  Görseli analiz et
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
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
                  Tabağının net bir görselini yükle
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={onPick}
            />
          </CardContent>
        </Card>
      </section>

      {/* How it works */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold">Nasıl çalışır?</h3>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-[18px]" />
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

      {/* Manual fallback */}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Görsel analizi hazırlanırken öğününü elle ekleyerek takibe hemen başlayabilirsin.
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
