import * as React from "react";
import { Leaf, Sparkles } from "lucide-react";

import { cn } from "@/shared/lib/utils";

interface HistoryEvaluationCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  showAiBadge?: boolean;
  variant?: "normal" | "share";
}

/** Shared History presentation shell used by the live view and privacy-filtered share mode. */
export function HistoryEvaluationCard({
  title,
  children,
  className,
  showAiBadge = true,
  variant = "normal",
}: HistoryEvaluationCardProps) {
  const share = variant === "share";
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[21px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-background to-cyan-50/90 p-3.5 shadow-[0_2px_10px_rgba(16,185,129,0.06)] dark:border-emerald-900/50 dark:from-emerald-950/35 dark:via-card dark:to-sky-950/25 sm:p-4",
        share &&
          "border-emerald-200/80 from-emerald-50 via-white to-cyan-50 text-slate-950 dark:border-emerald-200/80 dark:from-emerald-50 dark:via-white dark:to-cyan-50",
        className,
      )}
    >
      <Leaf
        className={cn(
          "pointer-events-none absolute -bottom-4 right-1 size-20 rotate-[-18deg] text-emerald-300/25 dark:text-emerald-500/10",
          share && "dark:text-emerald-300/25",
        )}
        strokeWidth={1.3}
        aria-hidden="true"
      />
      <div className="relative mb-2 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/45 dark:text-emerald-300",
            share && "dark:bg-emerald-100 dark:text-emerald-600",
          )}
        >
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-[13px] font-bold">{title}</h2>
            {showAiBadge && (
              <span
                className={cn(
                  "rounded-full bg-emerald-200/70 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-800/60 dark:text-emerald-200",
                  share && "dark:bg-emerald-200/70 dark:text-emerald-700",
                )}
              >
                AI
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
