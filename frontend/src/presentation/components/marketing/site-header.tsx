"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf, Menu, X } from "lucide-react";

import { APP_CONFIG } from "@/shared/constants/app";
import { MARKETING_NAV } from "@/shared/constants/site";
import { useAuth } from "@/application/auth/auth-store";
import { Button } from "@/presentation/components/ui/button";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import { cn } from "@/shared/lib/utils";

/**
 * Public marketing site header: a responsive, sticky SaaS navigation bar with a
 * mobile hamburger menu. Auth-aware — signed-in visitors get a direct link to
 * their dashboard instead of the login/register calls to action.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const { status } = useAuth();
  const [open, setOpen] = React.useState(false);

  const authed = status === "authenticated";

  // Close the mobile menu whenever the route changes.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight"
          aria-label={`${APP_CONFIG.name} ana sayfa`}
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="size-5 text-primary" aria-hidden="true" />
          </span>
          <span className="text-lg">{APP_CONFIG.name}</span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Ana gezinme">
          {MARKETING_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {authed ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Panele Git</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Giriş Yap</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Ücretsiz Başla</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border/70 bg-background md:hidden">
          <nav className="container flex flex-col gap-1 py-4" aria-label="Mobil gezinme">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  pathname === item.href && "bg-accent text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              {authed ? (
                <Button asChild className="w-full">
                  <Link href="/dashboard">Panele Git</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/login">Giriş Yap</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/register">Ücretsiz Başla</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
