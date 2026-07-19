"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";

/** A titled group of setting rows rendered as one rounded card. */
export function SettingGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {children}
      </div>
    </section>
  );
}

interface SettingRowProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  /** Small trailing content shown before the chevron (e.g. a badge or value). */
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** Danger styling for destructive actions like logout. */
  tone?: "default" | "danger";
  iconClassName?: string;
}

/** A single tappable settings row with an icon, label and trailing chevron. */
export function SettingRow({
  icon: Icon,
  label,
  description,
  value,
  href,
  onClick,
  tone = "default",
  iconClassName,
}: SettingRowProps) {
  const inner = (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          tone === "danger"
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary",
          iconClassName,
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block text-sm font-medium",
            tone === "danger" && "text-destructive",
          )}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {value && <span className="shrink-0 text-xs font-medium text-muted-foreground">{value}</span>}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );

  const rowClass =
    "flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50 active:bg-accent";

  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={rowClass}>
      {inner}
    </button>
  );
}
