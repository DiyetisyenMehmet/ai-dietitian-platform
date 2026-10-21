import * as React from "react";
import Link from "next/link";
import { BrandLockup } from "@/presentation/components/branding/brand-lockup";
import { AuthAlternatives } from "@/presentation/components/auth/auth-alternatives";
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
      <header className="flex items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="inline-flex min-w-0">
          <BrandLockup variant="auth" />
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
          <AuthAlternatives />
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
