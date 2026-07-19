import * as React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import type { FoodWarning } from "@/domain/health/types";

interface FoodWarningListProps {
  warnings: FoodWarning[];
  className?: string;
}

/**
 * Renders health warnings for a food (allergy = danger, condition = caution).
 * Guidance only — never a medical diagnosis. Renders nothing when empty.
 */
export function FoodWarningList({ warnings, className }: FoodWarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)} role="alert">
      {warnings.map((warning) => {
        const danger = warning.severity === "danger";
        const Icon = danger ? ShieldAlert : AlertTriangle;
        return (
          <div
            key={warning.id}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
              danger
                ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300"
                : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">
                {danger ? "Alerji uyarısı" : "Dikkat"}: {warning.trigger}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">{warning.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
