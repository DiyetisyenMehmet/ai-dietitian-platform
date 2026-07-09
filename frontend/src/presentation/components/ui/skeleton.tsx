import { cn } from "@/shared/lib/utils";

/** Placeholder block used to build skeleton loading screens. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-xl bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
