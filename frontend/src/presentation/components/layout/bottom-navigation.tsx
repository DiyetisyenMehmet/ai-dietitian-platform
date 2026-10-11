"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/shared/lib/utils";
import { PRIMARY_NAVIGATION } from "@/shared/constants/navigation";

/** Determines whether a nav href is the active route. */
function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation stays outside the AppShell's scrolling content. */
declare global {
  interface Window {
    __DIEWISH_NAVIGATE_HOME__?: () => void;
  }
}

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const shell = nav?.parentElement;
    if (!nav || !shell) return;

    // Labels can wrap with enlarged text. Reserve the real bar height (including
    // safe-area padding) in this shell without changing the navigation design.
    const updateHeight = () => {
      shell.style.setProperty(
        "--bottom-navigation-height",
        `${nav.getBoundingClientRect().height}px`,
      );
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(nav, { box: "border-box" });
    updateHeight();
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--bottom-navigation-height");
    };
  }, []);

  useEffect(() => {
    const navigateHome = () => router.replace("/dashboard");
    window.__DIEWISH_NAVIGATE_HOME__ = navigateHome;

    return () => {
      if (window.__DIEWISH_NAVIGATE_HOME__ === navigateHome) {
        delete window.__DIEWISH_NAVIGATE_HOME__;
      }
    };
  }, [router]);

  return (
    <nav
      ref={navRef}
      aria-label="Ana gezinme"
      className="safe-bottom relative z-40 shrink-0 border-t border-border bg-background/90 backdrop-blur-lg"
    >
      <ul className="mx-auto flex w-full max-w-2xl items-stretch justify-between px-2">
        {PRIMARY_NAVIGATION.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                replace
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center transition-colors",
                    item.id !== "ai" && "rounded-full",
                    active && item.id !== "ai" && "bg-accent",
                  )}
                >
                  <Icon
                    className={cn(item.id === "ai" ? "size-7 fill-current" : "size-5")}
                    aria-hidden="true"
                  />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
