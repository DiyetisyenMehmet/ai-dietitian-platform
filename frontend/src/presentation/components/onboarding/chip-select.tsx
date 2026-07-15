"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Input } from "@/presentation/components/ui/input";

interface ChipSelectProps {
  /** Suggested quick-select values. */
  presets: readonly string[];
  /** Currently selected values (preset or custom). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Placeholder for the custom-entry input. */
  addPlaceholder: string;
  ariaLabel: string;
}

/**
 * Multi-select chips with preset toggles plus free-form custom entries.
 * Selecting is idempotent and de-duplicated (case-insensitive). Designed for
 * optional lists such as health conditions and allergies.
 */
export function ChipSelect({ presets, value, onChange, addPlaceholder, ariaLabel }: ChipSelectProps) {
  const [draft, setDraft] = React.useState("");

  const has = (item: string) => value.some((v) => v.toLowerCase() === item.toLowerCase());

  const toggle = (item: string) => {
    if (has(item)) {
      onChange(value.filter((v) => v.toLowerCase() !== item.toLowerCase()));
    } else {
      onChange([...value, item]);
    }
  };

  const addCustom = () => {
    const trimmed = draft.trim();
    if (!trimmed || has(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const custom = value.filter((v) => !presets.some((p) => p.toLowerCase() === v.toLowerCase()));

  return (
    <div className="space-y-3" aria-label={ariaLabel}>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const selected = has(preset);
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(preset)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-all active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:border-primary/40 hover:bg-accent",
              )}
            >
              {selected && <Check className="size-3.5" aria-hidden="true" />}
              {preset}
            </button>
          );
        })}
      </div>

      {custom.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {custom.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3.5 py-2 text-sm text-foreground"
            >
              {item}
              <button
                type="button"
                aria-label={`${item} kaldır`}
                onClick={() => toggle(item)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder={addPlaceholder}
          className="flex-1"
        />
        <button
          type="button"
          onClick={addCustom}
          aria-label="Ekle"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-input transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
