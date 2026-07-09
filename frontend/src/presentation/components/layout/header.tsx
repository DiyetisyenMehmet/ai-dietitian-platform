"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/presentation/components/ui/button";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";

interface HeaderProps {
  /** Screen title shown centered/leading in the header. */
  title: string;
  /** Shows a back button that navigates to the previous route. */
  showBack?: boolean;
  /** Optional element rendered on the trailing side (before theme toggle). */
  action?: React.ReactNode;
  className?: string;
}

/** Sticky top application header with optional back navigation and title. */
export function Header({ title, showBack = false, action, className }: HeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-lg",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Geri"
            className="-ml-2"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Button>
        )}
        <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-1">
          {action}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
