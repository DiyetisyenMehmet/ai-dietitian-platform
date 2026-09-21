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
import { buildHistoryShareScene } from "./history-share-scene";

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
  nutrition: "border-orange-200/80 bg-orange-50/90",
  protein: "border-emerald-200/80 bg-emerald-50/90",
  water: "border-sky-200/80 bg-sky-50/90",
  activity: "border-teal-200/80 bg-teal-50/90",
  sleep: "border-indigo-200/80 bg-indigo-50/90",
  weight: "border-rose-200/80 bg-rose-50/90",
  neutral: "border-slate-200 bg-slate-50",
};

function VisualPreview({ payload }: { payload: HistorySharePayload }) {
  const scene = React.useMemo(() => buildHistoryShareScene(payload), [payload]);
  const comparisonLayout = scene.kind === "comparison";
  const dense = scene.density === "dense";

  return (
    <div
      role="img"
      aria-label={scene.ariaLabel}
      className="aspect-[9/16] w-full overflow-hidden rounded-[28px] border border-emerald-100 bg-[linear-gradient(145deg,#e7f6ef,#f2f8f5_55%,#edf5ff)] p-[3.5%] shadow-sm"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] bg-white p-[4%] shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="shrink-0 rounded-[22px] bg-[linear-gradient(135deg,#087a55,#0f9f72)] p-[4%] text-white">
          <p className="text-[9px] font-extrabold tracking-[0.2em]">{scene.brand}</p>
          <h3 className="mt-[2%] text-[15px] font-extrabold leading-tight">{scene.heading}</h3>
          <p className="mt-[1.5%] text-[9px] font-medium text-emerald-50/90">{scene.periodLabel}</p>
          {scene.comparisonLabel && (
            <p className="mt-[2%] rounded-full bg-white/15 px-2.5 py-1 text-[7px] font-semibold text-emerald-50">
              {scene.comparisonLabel}
            </p>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 py-[3%]",
            scene.density === "sparse"
              ? "flex flex-col justify-evenly"
              : "flex flex-col justify-center",
          )}
        >
          <div
            className={cn(
              comparisonLayout
                ? "space-y-2"
                : scene.normalColumns === 1
                  ? "grid grid-cols-1 gap-2"
                  : "grid grid-cols-2 gap-2",
            )}
          >
            {scene.cards.map((card) => (
              <div
                key={`${card.title}-${card.currentValue ?? card.value ?? ""}`}
                className={cn(
                  "min-w-0 rounded-[18px] border p-2.5",
                  PREVIEW_TONE[card.tone],
                  !comparisonLayout && scene.density === "sparse" && "min-h-24",
                )}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <p className="min-w-0 text-[9px] font-bold leading-tight text-slate-700">
                    {card.title}
                  </p>
                  {card.coverage && (
                    <span className="shrink-0 rounded-full bg-white/85 px-1.5 py-0.5 text-[6px] font-medium text-slate-500">
                      {card.coverage}
                    </span>
                  )}
                </div>

                {card.layout === "summary" ? (
                  <div className="flex min-h-11 items-center">
                    <p className="break-words text-[13px] font-extrabold leading-tight text-slate-900">
                      {card.value ?? "—"}
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white/85">
                    {[
                      [card.currentLabel ?? "Bu dönem", card.currentValue ?? "—"],
                      [card.previousLabel ?? "Önceki dönem", card.previousValue ?? "—"],
                      ["Fark", card.difference ?? "—"],
                    ].map(([label, value], index) => (
                      <div
                        key={label}
                        className={cn(
                          "min-w-0 px-1 py-1.5 text-center",
                          index > 0 && "border-l border-slate-200",
                        )}
                      >
                        <p className="min-h-4 break-words text-[6px] font-medium leading-tight text-slate-500">
                          {label}
                        </p>
                        <p className="mt-0.5 break-words text-[8px] font-extrabold leading-tight text-slate-900">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {!dense && card.description && (
                  <p className="mt-1 text-[6px] leading-tight text-slate-500">{card.description}</p>
                )}
                {card.note && (
                  <p className="mt-1 text-[6px] leading-tight text-slate-500">{card.note}</p>
                )}
              </div>
            ))}
          </div>

          {scene.details.map((detail) => (
            <div
              key={detail.title}
              className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5"
            >
              <p className="text-[8px] font-extrabold text-emerald-700">{detail.title}</p>
              <p className="mt-1 break-words text-[7px] leading-relaxed text-slate-600">
                {detail.lines.join(" • ")}
              </p>
            </div>
          ))}

          {scene.aiInsight && (
            <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5">
              <p className="text-[8px] font-extrabold text-emerald-700">Diewish değerlendirmesi</p>
              <p className="mt-1 whitespace-pre-line break-words text-[7px] leading-relaxed text-slate-600">
                {scene.aiInsight}
              </p>
            </div>
          )}
        </div>

        <p className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[6px] font-semibold leading-tight text-slate-500">
          {scene.footer}
        </p>
      </div>
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
