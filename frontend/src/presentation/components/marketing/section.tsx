import * as React from "react";

import { cn } from "@/shared/lib/utils";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Optional muted background band. */
  muted?: boolean;
}

/** Vertical rhythm wrapper for marketing page sections. */
export function Section({ className, muted, children, ...props }: SectionProps) {
  return (
    <section
      className={cn("py-16 sm:py-20", muted && "bg-muted/30", className)}
      {...props}
    >
      <div className="container">{children}</div>
    </section>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

/** Consistent eyebrow + title + description heading block for sections. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "space-y-3",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description && (
        <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
      )}
    </div>
  );
}
