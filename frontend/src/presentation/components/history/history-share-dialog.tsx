"use client";

import * as React from "react";
import { Share2, X } from "lucide-react";
import { toast } from "sonner";

import {
  DEFAULT_HISTORY_SHARE_OPTIONS,
  type HistoryShareOptions,
  type HistorySharePayload,
} from "@/application/history/history-share";
import { Button } from "@/presentation/components/ui/button";
import { shareHistoryPayload } from "./history-share-card";

interface HistoryShareDialogProps {
  open: boolean;
  onClose(): void;
  buildPayload(options: HistoryShareOptions): HistorySharePayload;
}

const OPTION_ROWS: Array<{
  key: keyof HistoryShareOptions;
  label: string;
  description: string;
}> = [
  { key: "includeNutrition", label: "Kalori ve makrolar", description: "Paylaşıma beslenme özetini ekler." },
  { key: "includeWater", label: "Su", description: "Kaydedilmiş su özetini ekler." },
  { key: "includeActivity", label: "Aktivite", description: "Aktif süre ve mevcut aktivite özetini ekler." },
  { key: "includeMealNames", label: "Öğün isimleri", description: "Varsayılan olarak kapalıdır." },
  { key: "includeSleep", label: "Uyku", description: "Varsayılan olarak kapalıdır." },
  { key: "includeWeight", label: "Kilo", description: "Varsayılan olarak kapalıdır." },
  { key: "includeAiInsight", label: "Diewish değerlendirmesi", description: "Varsayılan olarak kapalıdır." },
];

export function HistoryShareDialog({ open, onClose, buildPayload }: HistoryShareDialogProps) {
  const [options, setOptions] = React.useState<HistoryShareOptions>(
    DEFAULT_HISTORY_SHARE_OPTIONS,
  );
  const [sharing, setSharing] = React.useState(false);

  React.useEffect(() => {
    if (open) setOptions(DEFAULT_HISTORY_SHARE_OPTIONS);
  }, [open]);

  const payload = React.useMemo(() => buildPayload(options), [buildPayload, options]);

  if (!open) return null;

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareHistoryPayload(payload);
      if (result === "copied") toast.success("Paylaşım metni panoya kopyalandı.");
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
            <h2 className="text-lg font-semibold">Paylaşım önizlemesi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Yalnız açık bıraktığın alanlar görsele eklenir.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Kapat">
            <X aria-hidden="true" />
          </Button>
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

        <div className="mt-5 rounded-3xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{payload.title}</p>
          <p className="mt-1 text-sm font-medium">{payload.periodLabel}</p>
          <div className="mt-4 space-y-3">
            {payload.sections.length === 0 && !payload.aiInsight ? (
              <p className="text-sm text-muted-foreground">
                Seçili ve paylaşılabilir bir kayıt bulunmuyor.
              </p>
            ) : (
              payload.sections.map((section) => (
                <div key={section.title} className="rounded-2xl bg-background p-3">
                  <p className="text-sm font-semibold">{section.title}</p>
                  {section.lines.map((line) => (
                    <p key={line} className="mt-1 text-xs text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              ))
            )}
            {payload.aiInsight && (
              <div className="rounded-2xl bg-primary/10 p-3">
                <p className="text-sm font-semibold text-primary">Diewish değerlendirmesi</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {payload.aiInsight}
                </p>
              </div>
            )}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">{payload.footer}</p>
        </div>

        <div className="mt-5 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            className="flex-1"
            isLoading={sharing}
            disabled={payload.sections.length === 0 && !payload.aiInsight}
            onClick={() => void share()}
          >
            {!sharing && <Share2 aria-hidden="true" />}
            Paylaş
          </Button>
        </div>
      </div>
    </div>
  );
}
