"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { formatNumber } from "@/shared/lib/format";
import type { WeeklyPoint } from "@/application/goals/goal-insights";

interface WeeklyChartProps {
  data: WeeklyPoint[];
  /** Bar fill color class (matches the goal accent). */
  barClassName?: string;
  unit?: string;
}

/**
 * Lightweight, dependency-free weekly bar chart (placeholder visualization).
 * Bars grow from 0 to their height on mount for a premium feel.
 */
export function WeeklyChart({ data, barClassName = "bg-primary", unit }: WeeklyChartProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Fixed plot height (px) so bar heights resolve reliably inside flex.
  const PLOT_HEIGHT = 140;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      className="flex items-end justify-between gap-2"
      role="img"
      aria-label="Haftalık ilerleme grafiği"
    >
      {data.map((point, i) => {
        const heightPx = mounted ? Math.max(6, (point.value / max) * PLOT_HEIGHT) : 0;
        return (
          <div key={`${point.label}-${i}`} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-end justify-center" style={{ height: PLOT_HEIGHT }}>
              <div
                className={cn(
                  "w-full max-w-9 rounded-t-lg transition-all duration-700 ease-out",
                  barClassName,
                )}
                style={{ height: heightPx, transitionDelay: `${i * 60}ms` }}
                title={`${formatNumber(point.value)}${unit ? ` ${unit}` : ""}`}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}
