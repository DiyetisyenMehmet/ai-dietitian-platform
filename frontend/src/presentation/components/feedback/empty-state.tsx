import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  /** Icon illustrating the empty context. */
  icon?: LucideIcon;
  /** Short headline describing the empty state. */
  title: string;
  /** Supporting explanation. */
  description?: string;
  /** Optional primary call-to-action. */
  action?: EmptyStateAction;
  className?: string;
}

/** Professional empty-state surface with icon, explanation and primary action. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-14 text-center", className)}
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-accent">
        <Icon className="size-8 text-accent-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
