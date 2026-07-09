"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { Label } from "@/presentation/components/ui/label";

interface FormFieldProps {
  /** Input id — used to wire label, control and error message together. */
  id: string;
  /** Visible field label. */
  label: string;
  /** Validation error message, if any. */
  error?: string;
  /** Optional trailing element rendered next to the label (e.g. a link). */
  labelAction?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Accessible field wrapper: label, control slot and error message.
 * The control receives aria-invalid / aria-describedby via cloning so
 * screen readers announce validation errors.
 */
export function FormField({ id, label, error, labelAction, className, children }: FormFieldProps) {
  const errorId = `${id}-error`;

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      {control}
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
