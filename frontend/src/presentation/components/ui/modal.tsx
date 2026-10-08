"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/shared/lib/utils";

const Modal = DialogPrimitive.Root;
const ModalTrigger = DialogPrimitive.Trigger;
const ModalClose = DialogPrimitive.Close;
const ModalPortal = DialogPrimitive.Portal;

const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-modal-overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
ModalOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Keep animation names with a 1ms reduced-motion duration so Radix Presence
// receives the exit event even when the preference changes during dismissal.
const ModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    variant?: "default" | "centered" | "drawer" | "sheet";
    closeDisabled?: boolean;
  }
>(({ className, children, variant = "default", closeDisabled = false, ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay
      className={
        variant === "drawer"
          ? "data-[state=closed]:[animation-duration:180ms] data-[state=open]:[animation-duration:220ms] motion-reduce:![animation-delay:0ms] motion-reduce:![animation-duration:1ms]"
          : variant === "centered" || variant === "sheet"
            ? "data-[state=closed]:[animation-duration:140ms] data-[state=open]:[animation-duration:180ms] motion-reduce:![animation-delay:0ms] motion-reduce:![animation-duration:1ms]"
            : undefined
      }
    />
    <DialogPrimitive.Content
      ref={ref}
      data-modal-variant={variant}
      className={cn(
        "fixed z-50 border border-border bg-card shadow-card-hover",
        variant === "drawer"
          ? "inset-y-0 left-0 flex h-dvh w-[min(22rem,86vw)] flex-col overflow-hidden rounded-r-3xl data-[state=closed]:animate-panel-left-out data-[state=open]:animate-panel-left-in motion-reduce:![animation-delay:0ms] motion-reduce:![animation-duration:1ms]"
          : variant === "sheet"
            ? "bottom-0 left-1/2 grid max-h-[85dvh] w-full max-w-md -translate-x-1/2 gap-4 overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=closed]:animate-modal-sheet-out data-[state=open]:animate-modal-sheet-in motion-reduce:![animation-delay:0ms] motion-reduce:![animation-duration:1ms]"
            : "left-1/2 top-1/2 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl p-6",
        variant === "centered" &&
          "max-h-[calc(100dvh-2rem)] overflow-y-auto data-[state=closed]:animate-modal-center-out data-[state=open]:animate-modal-center-in motion-reduce:![animation-delay:0ms] motion-reduce:![animation-duration:1ms]",
        variant === "default" &&
          "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        disabled={closeDisabled}
        className={cn(
          "absolute right-4 top-4 rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-40",
          variant === "default" ? "p-1" : "flex size-10 items-center justify-center",
        )}
      >
        <X className="size-4" />
        <span className="sr-only">Kapat</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </ModalPortal>
));
ModalContent.displayName = DialogPrimitive.Content.displayName;

const ModalHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);
ModalHeader.displayName = "ModalHeader";

const ModalFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
ModalFooter.displayName = "ModalFooter";

const ModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
ModalTitle.displayName = DialogPrimitive.Title.displayName;

const ModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
ModalDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Modal,
  ModalPortal,
  ModalOverlay,
  ModalTrigger,
  ModalClose,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
};
