"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";

interface ProgressBarProps {
  /** Progress ratio expressed as 0..100. */
  value: number;
  className?: string;
  /** Track fill color class (defaults to primary). */
  indicatorClassName?: string;
}

/** Slim, animated horizontal progress bar. */
export function ProgressBar({ value, className, indicatorClassName }: ProgressBarProps) {
  const [animatedValue, setAnimatedValue] = React.useState(0);
  const clamped = Math.min(100, Math.max(0, value));

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedValue(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-1000 ease-out",
          indicatorClassName,
        )}
        style={{ width: `${animatedValue}%` }}
      />
    </div>
  );
}
