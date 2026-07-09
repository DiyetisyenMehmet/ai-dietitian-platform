"use client";

import { ChevronDown } from "lucide-react";

/** Floating button shown when the user has scrolled up in the chat. */
export function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="En alta kaydır"
      className="absolute bottom-4 left-1/2 z-10 flex size-10 -translate-x-1/2 animate-fade-in items-center justify-center rounded-full border border-border bg-card text-foreground shadow-card-hover transition-all hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown className="size-5" aria-hidden="true" />
    </button>
  );
}
