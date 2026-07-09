import { Loader2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/presentation/components/ui/skeleton";

interface LoadingProps {
  /** Optional message shown under the spinner. */
  label?: string;
  className?: string;
}

/** Centered spinner used for full-region loading states. */
export function Loading({ label = "Yükleniyor...", className }: LoadingProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Generic card-shaped skeleton used while content loads. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-2xl border border-border bg-card p-5", className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
