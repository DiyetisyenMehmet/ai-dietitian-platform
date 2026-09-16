import * as React from "react";

import type { WeightEntry } from "@/domain/health/types";
import {
  formatWeightNumber,
  sortWeightEntries,
  weightEntryTimestamp,
} from "@/application/health/weight-utils";

interface WeightChartProps {
  entries: WeightEntry[];
  targetKg: number;
  className?: string;
}

const W = 320;
const H = 180;
const PAD_X = 28;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

export interface WeightChartGeometry {
  points: { x: number; y: number; entry: WeightEntry }[];
  linePath: string | null;
  areaPath: string | null;
  targetY: number | null;
  yMin: number;
  yMax: number;
}

/** Pure chart model used by the component and targeted data-integrity tests. */
export function buildWeightChartGeometry(
  inputEntries: WeightEntry[],
  targetKg: number,
): WeightChartGeometry | null {
  const entries = sortWeightEntries(inputEntries).filter(
    (entry) => Number.isFinite(entry.weightKg) && entry.weightKg > 0,
  );
  if (entries.length === 0) return null;

  const validTarget = Number.isFinite(targetKg) && targetKg > 0 ? targetKg : null;
  const weights = entries.map((entry) => entry.weightKg);
  const domain = validTarget === null ? weights : [...weights, validTarget];
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  const rawRange = max - min;
  const padding = rawRange > 0 ? rawRange * 0.15 : Math.max(0.5, min * 0.01);
  const yMin = Math.max(0, min - padding);
  const yMax = max + padding;
  const yRange = yMax - yMin || 1;

  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const timestamps = entries.map(weightEntryTimestamp);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime;

  const x = (index: number) => {
    if (entries.length === 1) return PAD_X + plotW / 2;
    if (timeRange > 0) return PAD_X + ((timestamps[index] - minTime) / timeRange) * plotW;
    return PAD_X + (index / (entries.length - 1)) * plotW;
  };
  const y = (value: number) => PAD_TOP + plotH - ((value - yMin) / yRange) * plotH;

  const points = entries.map((entry, index) => ({ x: x(index), y: y(entry.weightKg), entry }));
  const linePath =
    points.length >= 2
      ? points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
      : null;
  const areaPath =
    linePath && points.length >= 2
      ? `${linePath} L ${points[points.length - 1].x} ${PAD_TOP + plotH} L ${points[0].x} ${PAD_TOP + plotH} Z`
      : null;

  return {
    points,
    linePath,
    areaPath,
    targetY: validTarget === null ? null : y(validTarget),
    yMin,
    yMax,
  };
}

export function WeightChart({ entries, targetKg, className }: WeightChartProps) {
  const geometry = React.useMemo(
    () => buildWeightChartGeometry(entries, targetKg),
    [entries, targetKg],
  );

  if (!geometry) return null;

  const first = geometry.points[0]?.entry;
  const latest = geometry.points.at(-1)?.entry;
  const description =
    first && latest
      ? `${geometry.points.length} ölçüm. İlk ölçüm ${formatWeightNumber(first.weightKg)} kg, son ölçüm ${formatWeightNumber(latest.weightKg)} kg${targetKg > 0 ? `, hedef ${formatWeightNumber(targetKg)} kg` : ""}.`
      : "Kilo ölçümleri.";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="Kilo değişim grafiği"
      preserveAspectRatio="none"
    >
      <title>Kilo değişim grafiği</title>
      <desc>{description}</desc>
      <defs>
        <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {geometry.targetY !== null && (
        <>
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
            y={Math.max(PAD_TOP + 9, geometry.targetY - 4)}
            textAnchor="end"
            className="fill-primary"
            fontSize={9}
          >
            Hedef {formatWeightNumber(targetKg)} kg
          </text>
        </>
      )}

      {geometry.areaPath && <path d={geometry.areaPath} fill="url(#weightArea)" />}
      {geometry.linePath && (
        <path
          d={geometry.linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {geometry.points.map((point, index) => (
        <circle
          key={point.entry.id}
          cx={point.x}
          cy={point.y}
          r={index === geometry.points.length - 1 ? 3.5 : 2.5}
          className="fill-background"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
