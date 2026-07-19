import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { Header } from "@/presentation/components/layout/header";
import { BottomNavigation } from "@/presentation/components/layout/bottom-navigation";

interface AppShellProps {
  /** Screen title rendered in the header. */
  title: string;
  /** Shows the header back button. */
  showBack?: boolean;
  /** Trailing header action element. */
  headerAction?: React.ReactNode;
  /** Hides the bottom navigation (e.g. for auth/full-screen flows). */
  hideBottomNav?: boolean;
  /** Hides the shared header (e.g. screens providing their own top bar). */
  hideHeader?: boolean;
  /**
   * Fill mode: the content region occupies the exact space between the header
   * and the bottom navigation with no internal padding and no page scroll.
   * Children are expected to manage their own scrolling (e.g. the AI chat).
   */
  fill?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Responsive application shell: sticky header, scrollable content region,
 * and fixed bottom navigation. Mobile-first with a centered max-width column.
 */
export function AppShell({
  title,
  showBack,
  headerAction,
  hideBottomNav = false,
  hideHeader = false,
  fill = false,
  children,
  className,
}: AppShellProps) {
  if (fill) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        {!hideHeader && <Header title={title} showBack={showBack} action={headerAction} />}
        <main
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            !hideBottomNav && "mb-[calc(4.25rem+env(safe-area-inset-bottom))]",
            className,
          )}
        >
          {children}
        </main>
        {!hideBottomNav && <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {!hideHeader && <Header title={title} showBack={showBack} action={headerAction} />}
      <main
        className={cn(
          "mx-auto w-full max-w-2xl flex-1 px-4 py-5",
          hideBottomNav ? "pb-8" : "pb-24",
          className,
        )}
      >
        {children}
      </main>
      {!hideBottomNav && <BottomNavigation />}
    </div>
  );
}
