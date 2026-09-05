"use client";

import * as React from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { QuickPromptsSheet } from "./quick-prompts-sheet";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  showSuggestions?: boolean;
}

/**
 * Rounded message composer with auto-growing textarea. Sticky positioning
 * keeps it above the mobile keyboard. Mid-conversation starter prompts remain
 * available through a compact, quota-safe quick-prompts sheet.
 */
export function ChatInput({ onSend, disabled = false, showSuggestions = false }: ChatInputProps) {
  const [value, setValue] = React.useState("");
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
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

  const selectSuggestion = React.useCallback(
    (prompt: string) => {
      setValue(prompt);
      setSuggestionsOpen(false);
      requestAnimationFrame(() => {
        resize();
        textareaRef.current?.focus();
      });
    },
    [resize],
  );

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <>
      <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 pb-3">
          {showSuggestions && (
            <button
              type="button"
              onClick={() => setSuggestionsOpen(true)}
              disabled={disabled}
              aria-label="Hızlı önerileri aç"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full border border-input bg-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                disabled
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : "text-primary hover:border-primary/30 hover:bg-primary/5",
              )}
            >
              <Sparkles className="size-4.5" aria-hidden="true" />
            </button>
          )}

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

      <QuickPromptsSheet
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onSelect={selectSuggestion}
      />
    </>
  );
}
