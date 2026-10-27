"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { usePathname } from "next/navigation";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

/** Publish presentation only, after next-themes has applied its saved choice. */
function ThemePresentationSync() {
  const { theme, resolvedTheme } = useTheme();
  const pathname = usePathname();
  const onAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  React.useEffect(() => {
    if (
      onAdmin ||
      !["system", "light", "dark"].includes(theme ?? "") ||
      !["light", "dark"].includes(resolvedTheme ?? "")
    )
      return;
    const root = document.documentElement;
    const host = window as Window & {
      DiewishSystemUi?: {
        setThemePreference?: (preference: string, dark: boolean) => void;
        setDarkTheme?: (dark: boolean) => void;
      };
    };
    let last = "";
    const sync = () => {
      const dark = resolvedTheme === "dark";
      // React context may update before next-themes' DOM effect. Never publish
      // that intermediate frame to the native launch cover or system bars.
      if (root.classList.contains("dark") !== dark || root.style.colorScheme !== resolvedTheme)
        return;
      root.dataset.diewishThemeReady = resolvedTheme;
      const key = `${theme}:${resolvedTheme}`;
      if (last === key) return;
      last = key;
      try {
        if (host.DiewishSystemUi?.setThemePreference)
          host.DiewishSystemUi.setThemePreference(theme!, dark);
        else host.DiewishSystemUi?.setDarkTheme?.(dark); // installed older Android shells
      } catch {
        /* Presentation bridge availability never blocks the web app. */
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    sync();
    return () => {
      observer.disconnect();
      delete root.dataset.diewishThemeReady;
    };
  }, [theme, resolvedTheme, onAdmin]);
  return null;
}

/** Wraps next-themes to provide class-based Light/Dark theming. */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemePresentationSync />
      {children}
    </NextThemesProvider>
  );
}
