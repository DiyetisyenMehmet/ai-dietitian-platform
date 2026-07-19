import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { healthIcon } from "@/presentation/components/health/health-icon";
import type { HealthIconKey } from "@/domain/health/types";

interface SectionCardProps {
  icon: HealthIconKey;
  title: string;
  /** Optional trailing element (e.g. an edit/link action). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A titled card section with a leading icon — the building block of the profile. */
export function SectionCard({ icon, title, action, children, className }: SectionCardProps) {
  const Icon = healthIcon(icon);
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Two-column definition grid for label/value pairs. */
export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-4">{children}</dl>;
}

/** A single label/value pair inside an InfoGrid. */
export function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

/** A pill/chip, optionally emphasized for warnings (e.g. allergies). */
export function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "primary" | "danger" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "danger" && "bg-red-500/10 text-red-600 dark:text-red-400",
        tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {label}
    </span>
  );
}

/** A wrapping row of chips with an empty fallback. */
export function ChipList({
  items,
  tone = "neutral",
  empty,
}: {
  items: string[];
  tone?: "neutral" | "primary" | "danger" | "warning";
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Chip key={item} label={item} tone={tone} />
      ))}
    </div>
  );
}
