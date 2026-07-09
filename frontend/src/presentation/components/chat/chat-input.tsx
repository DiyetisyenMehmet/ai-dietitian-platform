"use client";

import * as React from "react";
import { ArrowUp, Mic, Paperclip } from "lucide-react";

import { cn } from "@/shared/lib/utils";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

/**
 * Rounded message composer with auto-growing textarea. Voice and attachment
 * buttons are intentional disabled placeholders (out of Sprint 5 scope).
 * Sticky positioning keeps it above the mobile keyboard.
 */
export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const resize = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  const submit = React.useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  }, [value, disabled, onSend]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 pb-3">
        <button
          type="button"
          disabled
          aria-label="Dosya ekle (yakında)"
          title="Yakında"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-50"
        >
          <Paperclip className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-1 items-end rounded-3xl border border-input bg-card px-4 py-1 shadow-card focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            onChange={(e) => {
              setValue(e.target.value);
              resize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Bir mesaj yazın..."
            aria-label="Mesaj"
            className="max-h-[140px] flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            disabled
            aria-label="Sesli mesaj (yakında)"
            title="Yakında"
            className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-50"
          >
            <Mic className="size-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Gönder"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
            canSend
              ? "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
