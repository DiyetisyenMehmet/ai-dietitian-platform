"use client";

import * as React from "react";
import { ArrowLeft, FileText, Image as ImageIcon, Share2, X } from "lucide-react";
import { toast } from "sonner";

import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  HISTORY_VISUAL_SHARE_CAPTION,
  type HistoryShareOptions,
  type HistorySharePayload,
} from "@/application/history/history-share";
import { Button } from "@/presentation/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { historyPayloadText, shareHistoryText } from "./history-share-card";
import { HistoryShareDom } from "./history-share-dom";
import { shareHistoryDomVisual } from "./history-share-dom-export";

interface HistoryShareDialogProps {
  open: boolean;
  onClose(): void;
  buildPayload(options: HistoryShareOptions): HistorySharePayload;
}

type ShareMode = "visual" | "text";

const OPTION_ROWS: Array<{
  key: keyof HistoryShareOptions;
  label: string;
  description: string;
}> = [
  {
    key: "includeNutrition",
    label: "Kalori ve makrolar",
    description: "Paylaşıma beslenme özetini ekler.",
  },
  { key: "includeWater", label: "Su", description: "Kaydedilmiş su özetini ekler." },
  {
    key: "includeActivity",
    label: "Aktivite",
    description: "Hareket süresi ve mevcut aktivite özetini ekler.",
  },
  { key: "includeMealNames", label: "Öğün isimleri", description: "Varsayılan olarak kapalıdır." },
  { key: "includeSleep", label: "Uyku", description: "Varsayılan olarak kapalıdır." },
  { key: "includeWeight", label: "Kilo", description: "Varsayılan olarak kapalıdır." },
  {
    key: "includeAiInsight",
    label: "Diewish değerlendirmesi",
    description: "Varsayılan olarak kapalıdır.",
  },
];

export function HistoryShareDialog({ open, onClose, buildPayload }: HistoryShareDialogProps) {
  const [options, setOptions] = React.useState<HistoryShareOptions>(DEFAULT_HISTORY_SHARE_OPTIONS);
  const [mode, setMode] = React.useState<ShareMode>("visual");
  const [sharing, setSharing] = React.useState(false);
  const [visualCaptionEnabled, setVisualCaptionEnabled] = React.useState(false);
  const [visualPreviewOpen, setVisualPreviewOpen] = React.useState(false);
  const captureRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setOptions(DEFAULT_HISTORY_SHARE_OPTIONS);
      setMode("visual");
      setVisualCaptionEnabled(false);
      setVisualPreviewOpen(false);
    }
  }, [open]);

  const payload = React.useMemo(() => buildPayload(options), [buildPayload, options]);
  const textPreview = React.useMemo(() => historyPayloadText(payload), [payload]);

  if (!open) return null;

  const empty = payload.visualCards.length === 0 && !payload.aiInsight;

  const shareText = async () => {
    if (sharing || empty) return;
    setSharing(true);
    try {
      const result = await shareHistoryText(payload);

      if (result === "copied") toast.success("Paylaşım metni panoya kopyalandı.");
      if (result === "shared") onClose();
    } catch {
      toast.error("Geçmiş özeti paylaşılamadı. Lütfen tekrar dene.");
    } finally {
      setSharing(false);
    }
  };

  const shareVisual = async () => {
    if (sharing || empty || !captureRef.current) return;
    setSharing(true);
    try {
      const result = await shareHistoryDomVisual(
        captureRef.current,
        payload,
        visualCaptionEnabled ? HISTORY_VISUAL_SHARE_CAPTION : null,
      );
      if (result === "downloaded") toast.success("Paylaşım görseli indirildi.");
      if (result === "shared") onClose();
    } catch {
      toast.error("Geçmiş özeti paylaşılamadı. Lütfen tekrar dene.");
    } finally {
      setSharing(false);
    }
  };

  if (visualPreviewOpen) {
    return (
      <div
        className="fixed inset-0 z-[80] flex flex-col bg-background"
        role="dialog"
        aria-modal="true"
        aria-label="Görsel paylaşım önizlemesi"
      >
        <div className="z-10 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setVisualPreviewOpen(false)}
            aria-label="Gizlilik seçimlerine dön"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold">Paylaşım önizlemesi</p>
            <p className="text-[10px] text-muted-foreground">Gördüğün içerik aynen paylaşılır.</p>
          </div>
          <Button type="button" size="sm" isLoading={sharing} onClick={() => void shareVisual()}>
            {!sharing && <Share2 aria-hidden="true" />}
            Paylaş
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/35 px-2.5 py-4 sm:px-5 sm:py-6">
          <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[26px] shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
            <HistoryShareDom payload={payload} captureRef={captureRef} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Geçmiş paylaşım önizlemesi"
    >
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto overflow-x-hidden rounded-t-3xl border border-border bg-background p-4 shadow-xl sm:rounded-3xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Paylaşım</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Görsel veya yazı paylaşımını seç; gizlilik tercihlerin her ikisinde de aynen
              uygulanır.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Kapat">
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-muted/70 p-1">
          <button
            type="button"
            aria-pressed={mode === "visual"}
            onClick={() => setMode("visual")}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-3 sm:text-sm",
              mode === "visual"
                ? "border-primary/35 bg-background text-foreground shadow-sm ring-1 ring-primary/10 dark:border-primary/50 dark:bg-card"
                : "border-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground",
            )}
          >
            <ImageIcon className="size-4" aria-hidden="true" />
            Görsel olarak paylaş
          </button>
          <button
            type="button"
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-3 sm:text-sm",
              mode === "text"
                ? "border-primary/35 bg-background text-foreground shadow-sm ring-1 ring-primary/10 dark:border-primary/50 dark:bg-card"
                : "border-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground",
            )}
          >
            <FileText className="size-4" aria-hidden="true" />
            Yazı olarak paylaş
          </button>
        </div>

        {mode === "visual" && (
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border p-3">
            <span>
              <span className="block text-sm font-medium">Paylaşım mesajı ekle</span>
              <span className="block text-xs text-muted-foreground">
                Görselin yanında yalnız kısa bir Diewish mesajı paylaşılır. Varsayılan olarak
                kapalıdır.
              </span>
            </span>
            <input
              type="checkbox"
              checked={visualCaptionEnabled}
              onChange={(event) => setVisualCaptionEnabled(event.target.checked)}
              className="size-5 accent-primary"
            />
          </label>
        )}

        <div className="mt-5 space-y-2">
          {OPTION_ROWS.map((row) => (
            <label
              key={row.key}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border p-3"
            >
              <span>
                <span className="block text-sm font-medium">{row.label}</span>
                <span className="block text-xs text-muted-foreground">{row.description}</span>
              </span>
              <input
                type="checkbox"
                checked={options[row.key]}
                onChange={(event) =>
                  setOptions((current) => ({ ...current, [row.key]: event.target.checked }))
                }
                className="size-5 accent-primary"
              />
            </label>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {mode === "visual" ? "Görsel önizleme" : "Yazı önizleme"}
            </p>
            {mode === "visual" && (
              <span className="text-[10px] text-muted-foreground">Responsive History UI</span>
            )}
          </div>

          {empty ? (
            <div className="rounded-3xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
              Seçili ve paylaşılabilir bir kayıt bulunmuyor.
            </div>
          ) : mode === "visual" ? (
            <div className="rounded-3xl border border-emerald-200/70 bg-emerald-50/60 p-4 text-sm leading-relaxed text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
              Seçtiğin alanlarla temiz, tam ekran bir Geçmişim önizlemesi hazırlanacak. Paylaşılan
              PNG bu önizlemeyle aynı içerikten üretilir.
            </div>
          ) : (
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-3xl border border-border bg-muted/30 p-4 font-sans text-xs leading-relaxed text-foreground">
              {textPreview}
            </pre>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            className="flex-1"
            isLoading={sharing}
            disabled={empty}
            onClick={() => {
              if (mode === "visual") setVisualPreviewOpen(true);
              else void shareText();
            }}
          >
            {!sharing && <Share2 aria-hidden="true" />}
            {mode === "visual" ? "Önizlemeyi Aç" : "Yazıyı Paylaş"}
          </Button>
        </div>
      </div>
    </div>
  );
}
