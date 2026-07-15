"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import type { SelectOption } from "@/domain/onboarding/types";

interface OptionCardsProps<T extends string> {
  options: readonly SelectOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  /** Number of columns on >= sm screens (1 or 2). Mobile is always single column. */
  columns?: 1 | 2;
  /** Accessible group label. */
  ariaLabel: string;
}

/**
 * Single-select, tappable option cards. Mobile-first with large touch targets;
 * the selected card is highlighted and shows a check mark. Fully keyboard
 * accessible via radio semantics.
 */
export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  columns = 1,
  ariaLabel,
}: OptionCardsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-2.5", columns === 2 && "sm:grid-cols-2")}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-input hover:border-primary/40 hover:bg-accent",
            )}
          >
            <span className="min-w-0">
              <span className="block font-medium">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {selected && <Check className="size-3.5" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
