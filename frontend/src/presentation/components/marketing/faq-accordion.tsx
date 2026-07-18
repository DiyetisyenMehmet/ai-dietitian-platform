"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import type { FaqItem } from "@/shared/constants/site";
import { cn } from "@/shared/lib/utils";

interface FaqAccordionProps {
  items: readonly FaqItem[];
}

/**
 * Lightweight, dependency-free FAQ accordion. Uses a single-open pattern with
 * accessible button/region semantics (no external accordion library required).
 */
export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        const buttonId = `faq-button-${index}`;
        return (
          <div key={item.question}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium transition-colors hover:text-primary"
              >
                <span>{item.question}</span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
