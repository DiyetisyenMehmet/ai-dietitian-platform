"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, Share2, X } from "lucide-react";
import { toast } from "sonner";

import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  type HistoryShareOptions,
  type HistorySharePayload,
  type HistoryShareVisualTone,
} from "@/application/history/history-share";
import { Button } from "@/presentation/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { historyPayloadText, shareHistoryText, shareHistoryVisual } from "./history-share-card";

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

const PREVIEW_TONE: Record<HistoryShareVisualTone, string> = {
  nutrition: "border-orange-200/70 bg-orange-50/80 dark:border-orange-900/50 dark:bg-orange-950/20",
  protein:
    "border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20",
  water: "border-sky-200/70 bg-sky-50/80 dark:border-sky-900/50 dark:bg-sky-950/20",
  activity: "border-teal-200/70 bg-teal-50/80 dark:border-teal-900/50 dark:bg-teal-950/20",
  sleep: "border-indigo-200/70 bg-indigo-50/80 dark:border-indigo-900/50 dark:bg-indigo-950/20",
  weight: "border-rose-200/70 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/20",
  neutral: "border-border bg-card",
};

function VisualPreview({ payload }: { payload: HistorySharePayload }) {
  const comparisonLayout = payload.kind === "comparison";
  const mealNames = payload.sections
    .flatMap((section) => section.lines)
    .find((line) => line.startsWith("Öğünler:"));

  return (
    <div className="overflow-hidden rounded-[28px] border border-border bg-slate-50 p-3 shadow-sm dark:bg-slate-950/40">
      <div className="rounded-[24px] bg-emerald-700 p-4 text-white">
        <p className="text-[10px] font-bold tracking-[0.18em]">DIEWISH</p>
        <h3 className="mt-2 text-base font-bold">{payload.title.replace("Diewish • ", "")}</h3>
        <p className="mt-1 text-xs text-emerald-50/90">{payload.periodLabel}</p>
      </div>

      {payload.comparisonLabel && (
        <p className="mt-3 rounded-2xl bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
          {payload.comparisonLabel}
        </p>
      )}

      <div className={cn("mt-3 gap-2.5", comparisonLayout ? "space-y-2.5" : "grid grid-cols-2")}>
        {payload.visualCards.map((card) => (
          <div
            key={`${card.title}-${card.currentValue ?? card.value ?? ""}`}
            className={cn("min-w-0 rounded-[20px] border p-3", PREVIEW_TONE[card.tone])}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold leading-tight">{card.title}</p>
                {card.description && (
                  <p className="mt-1 text-[8px] leading-tight text-muted-foreground">
                    {card.description}
                  </p>
                )}
              </div>
              {card.coverage && (
                <span className="shrink-0 rounded-full bg-background/80 px-2 py-0.5 text-[8px] text-muted-foreground">
                  {card.coverage}
                </span>
              )}
            </div>

            {card.layout === "summary" ? (
              <p className="mt-2 break-words text-sm font-bold">{card.value}</p>
            ) : (
              <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-xl border border-border/60 bg-background/80">
                {[
                  [card.currentLabel ?? "Bu dönem", card.currentValue ?? "—"],
                  [card.previousLabel ?? "Önceki dönem", card.previousValue ?? "—"],
                  ["Fark", card.difference ?? "—"],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={cn(
                      "min-w-0 px-1.5 py-2 text-center",
                      index > 0 && "border-l border-border/60",
                    )}
                  >
                    <p className="min-h-6 break-words text-[8px] leading-tight text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 break-words text-[10px] font-bold leading-tight">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {card.note && (
              <p className="mt-2 text-[8px] leading-snug text-muted-foreground">{card.note}</p>
            )}
          </div>
        ))}
      </div>

      {mealNames && (
        <div className="mt-3 rounded-2xl border border-border bg-background/85 p-3">
          <p className="text-[11px] font-semibold">Öğünler</p>
          <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">
            {mealNames.replace(/^Öğünler:\s*/, "")}
          </p>
        </div>
      )}

      {payload.aiInsight && (
        <div className="mt-3 rounded-2xl bg-emerald-500/10 p-3">
          <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">
            Diewish değerlendirmesi
          </p>
          <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">
            {payload.aiInsight}
          </p>
        </div>
      )}

      <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">{payload.footer}</p>
    </div>
  );
}

export function HistoryShareDialog({ open, onClose, buildPayload }: HistoryShareDialogProps) {
  const [options, setOptions] = React.useState<HistoryShareOptions>(DEFAULT_HISTORY_SHARE_OPTIONS);
  const [mode, setMode] = React.useState<ShareMode>("visual");
  const [sharing, setSharing] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setOptions(DEFAULT_HISTORY_SHARE_OPTIONS);
      setMode("visual");
    }
  }, [open]);

  const payload = React.useMemo(() => buildPayload(options), [buildPayload, options]);
  const textPreview = React.useMemo(() => historyPayloadText(payload), [payload]);

  if (!open) return null;

  const empty = payload.sections.length === 0 && !payload.aiInsight;

  const share = async () => {
    if (sharing || empty) return;
    setSharing(true);
    try {
      const result =
        mode === "visual" ? await shareHistoryVisual(payload) : await shareHistoryText(payload);

      if (result === "copied") toast.success("Paylaşım metni panoya kopyalandı.");
      if (result === "downloaded") toast.success("Paylaşım görseli indirildi.");
      if (result === "shared") onClose();
    } catch {
      toast.error("Geçmiş özeti paylaşılamadı. Lütfen tekrar dene.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Geçmiş paylaşım önizlemesi"
    >
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-xl sm:rounded-3xl">
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
            onClick={() => setMode("visual")}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
              mode === "visual" ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
            )}
          >
            <ImageIcon className="size-4" aria-hidden="true" />
            Görsel olarak paylaş
          </button>
          <button
            type="button"
            onClick={() => setMode("text")}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
              mode === "text" ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
            )}
          >
            <FileText className="size-4" aria-hidden="true" />
            Yazı olarak paylaş
          </button>
        </div>

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
              <span className="text-[10px] text-muted-foreground">Story • 1080×1920</span>
            )}
          </div>

          {empty ? (
            <div className="rounded-3xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
              Seçili ve paylaşılabilir bir kayıt bulunmuyor.
            </div>
          ) : mode === "visual" ? (
            <VisualPreview payload={payload} />
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
            onClick={() => void share()}
          >
            {!sharing && <Share2 aria-hidden="true" />}
            {mode === "visual" ? "Görseli Paylaş" : "Yazıyı Paylaş"}
          </Button>
        </div>
      </div>
    </div>
  );
}
