"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";

interface CircularProgressProps {
  /** Progress ratio expressed as 0..100. */
  value: number;
  /** Outer diameter in pixels. */
  size?: number;
  /** Stroke thickness in pixels. */
  strokeWidth?: number;
  className?: string;
  /** Centered content (numbers/labels). */
  children?: React.ReactNode;
}

/**
 * Animated circular (ring) progress indicator.
 * The arc animates from 0 to `value` on mount via a CSS stroke transition.
 */
export function CircularProgress({
  value,
  size = 200,
  strokeWidth = 16,
  className,
  children,
}: CircularProgressProps) {
  const [animatedValue, setAnimatedValue] = React.useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (animatedValue / 100) * circumference;

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedValue(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
