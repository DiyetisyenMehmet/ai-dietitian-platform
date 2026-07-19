import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";

interface WeightChartProps {
  /** Entries sorted oldest → newest. */
  entries: WeightEntry[];
  targetKg: number;
  className?: string;
}

const W = 320;
const H = 180;
const PAD_X = 28;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

/**
 * Lightweight, dependency-free SVG line chart of weight over time with a dashed
 * target line. Purely presentational — scales to its container width.
 */
export function WeightChart({ entries, targetKg, className }: WeightChartProps) {
  const geometry = React.useMemo(() => {
    if (entries.length === 0) return null;

    const weights = entries.map((e) => e.weightKg);
    const min = Math.min(...weights, targetKg);
    const max = Math.max(...weights, targetKg);
    const range = max - min || 1;
    const padded = range * 0.15;
    const yMin = min - padded;
    const yMax = max + padded;

    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_TOP - PAD_BOTTOM;

    const x = (i: number) =>
      entries.length === 1 ? PAD_X + plotW / 2 : PAD_X + (i / (entries.length - 1)) * plotW;
    const y = (v: number) => PAD_TOP + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const points = entries.map((e, i) => ({ x: x(i), y: y(e.weightKg), entry: e }));
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath =
      `${linePath} L ${points[points.length - 1].x} ${PAD_TOP + plotH}` +
      ` L ${points[0].x} ${PAD_TOP + plotH} Z`;
    const targetY = y(targetKg);

    return { points, linePath, areaPath, targetY, yMin, yMax };
  }, [entries, targetKg]);

  if (!geometry) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="Kilo değişim grafiği"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Target line */}
      <line
        x1={PAD_X}
        y1={geometry.targetY}
        x2={W - PAD_X}
        y2={geometry.targetY}
        stroke="hsl(var(--primary))"
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.7}
      />
      <text
        x={W - PAD_X}
        y={geometry.targetY - 4}
        textAnchor="end"
        className="fill-primary"
        fontSize={9}
      >
        Hedef {targetKg} kg
      </text>

      {/* Area + line */}
      <path d={geometry.areaPath} fill="url(#weightArea)" />
      <path
        d={geometry.linePath}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Points */}
      {geometry.points.map((p, i) => (
        <circle
          key={p.entry.id}
          cx={p.x}
          cy={p.y}
          r={i === geometry.points.length - 1 ? 3.5 : 2.5}
          className="fill-background"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
