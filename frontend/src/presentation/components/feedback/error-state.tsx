"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";

interface ErrorStateProps {
  /** Short, friendly headline. */
  title?: string;
  /** Human-readable explanation of the failure. */
  message?: string;
  /** Retry handler; when provided a Retry action is shown. */
  onRetry?: () => void;
  className?: string;
}

/** Friendly, reusable error surface with an optional retry action. */
export function ErrorState({
  title = "Bir şeyler ters gitti",
  message = "İstek tamamlanamadı. Lütfen tekrar deneyin.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-14 text-center", className)}
      role="alert"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-7 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Tekrar Dene
        </Button>
      )}
    </div>
  );
}
