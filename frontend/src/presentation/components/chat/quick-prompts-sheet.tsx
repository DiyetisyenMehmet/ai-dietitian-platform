"use client";

import * as React from "react";
import { Sparkles, X } from "lucide-react";

import { SUGGESTIONS } from "@/application/chat/placeholder-responses";
import { cn } from "@/shared/lib/utils";

interface QuickPromptsSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (prompt: string) => void;
}

/** Mobile-first action sheet that keeps AI Coach starter prompts available mid-chat. */
export function QuickPromptsSheet({ open, onClose, onSelect }: QuickPromptsSheetProps) {
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button
        type="button"
        aria-label="Hızlı önerileri kapat"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-prompts-title"
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-hidden rounded-t-[28px] border border-border bg-card shadow-2xl",
          "sm:inset-x-1/2 sm:bottom-6 sm:w-[min(620px,calc(100%-2rem))] sm:-translate-x-1/2 sm:rounded-[28px]",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/25 sm:hidden" />

        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="quick-prompts-title" className="text-sm font-semibold">
                Hızlı öneriler
              </h2>
              <p className="text-xs text-muted-foreground">Bir öneri seç, istersen düzenleyip gönder.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid max-h-[60dvh] grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
          {SUGGESTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.prompt)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:border-primary/35 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium leading-snug">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
