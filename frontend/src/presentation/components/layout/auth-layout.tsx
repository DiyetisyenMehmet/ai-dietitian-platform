import * as React from "react";
import Link from "next/link";
import { Leaf } from "lucide-react";

import { APP_CONFIG } from "@/shared/constants/app";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";

interface AuthLayoutProps {
  /** Heading shown above the form (e.g. "Giriş Yap"). */
  title: string;
  /** Supporting subtitle text. */
  subtitle?: string;
  /** Footer slot, typically a link to switch auth flows. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Full-screen, mobile-first layout for authentication flows.
 * No bottom navigation. Content is vertically centered on large screens and
 * scrolls naturally on small screens so form actions stay reachable when the
 * mobile keyboard is open.
 */
export function AuthLayout({ title, subtitle, footer, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="size-4 text-primary" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-semibold">{APP_CONFIG.name}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {APP_CONFIG.tagline}
            </span>
          </span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-6 space-y-1.5 text-center">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
