"use client";

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
 * One bounded application viewport. Only the content region scrolls; the header
 * and navigation occupy their own space outside it. Chat owns its inner scroll.
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
  const shellRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    if (!shell || !viewport) return;

    // Dynamic viewport units follow browser chrome, but not a keyboard that
    // resizes only the visual viewport. Keep the whole shell in the visible area.
    // Do not reflow the application when the user magnifies the page.
    const updateViewport = () => {
      if (viewport.scale !== 1) return;
      shell.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      shell.style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
    };
    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      data-app-shell
      className="fixed inset-x-0 flex h-dvh flex-col bg-background"
      style={{
        height: "var(--app-viewport-height, 100dvh)",
        top: "var(--app-viewport-top, 0px)",
      }}
    >
      {!hideHeader && (
        <Header title={title} showBack={showBack} action={headerAction} className="shrink-0" />
      )}
      <main
        data-app-scroll={fill ? undefined : ""}
        className={cn(
          fill
            ? "relative flex min-h-0 flex-1 flex-col overflow-hidden"
            : "mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-y-contain px-4 py-5",
          !fill &&
            (hideBottomNav
              ? "pb-8"
              : // Preserve A1's total bottom reserve; the bar now occupies flow space.
                "pb-[max(1.25rem,calc(6rem+env(safe-area-inset-bottom)-var(--bottom-navigation-height,4.25rem)))]"),
          className,
        )}
      >
        {children}
      </main>
      {!hideBottomNav && <BottomNavigation />}
    </div>
  );
}
