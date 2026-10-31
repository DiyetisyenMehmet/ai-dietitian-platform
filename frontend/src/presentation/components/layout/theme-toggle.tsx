"use client";

import * as React from "react";
import { Monitor, Moon, Smartphone, Sun, Tablet } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";

import { Button } from "@/presentation/components/ui/button";
import styles from "./theme-toggle.module.css";

const modes = ["light", "dark", "system"] as const;
type Mode = (typeof modes)[number];
const hintsKey = "diewish:appearance-hints:v1";
const choices = {
  light: { label: "Gündüz modu", description: "Gündüz: Diewish her zaman açık görünür" },
  dark: { label: "Gece modu", description: "Gece: Diewish her zaman koyu görünür" },
  system: { label: "Sistem modu", description: "Sistem: Cihazın görünümünü otomatik takip eder." },
};

/** Existing preference key and defaults stay with next-themes. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const onAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const [mounted, setMounted] = React.useState(false);
  const [device, setDevice] = React.useState<"phone" | "tablet" | "computer">("computer");
  const [hint, setHint] = React.useState<Mode | null>(null);
  const [hover, setHover] = React.useState(false);
  const [keyboardFocus, setKeyboardFocus] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const descriptionId = React.useId();
  const counts = React.useRef<Record<Mode, number>>({ light: 0, dark: 0, system: 0 });
  const hintTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = React.useRef<{ x: number; y: number; pointer: number } | null>(null);
  const suppressClick = React.useRef(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (onAdmin) return;
    // Only local, low-entropy device hints; no device identifiers or network calls.
    const detect = () => {
      const agent = navigator.userAgent;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const tablet =
        /iPad/i.test(agent) ||
        (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1) ||
        (/Android/i.test(agent) && !/Mobile/i.test(agent));
      setDevice(
        tablet
          ? "tablet"
          : /iPhone|iPod|Android.*Mobile/i.test(agent)
            ? "phone"
            : coarse
              ? Math.min(innerWidth, innerHeight) >= 600
                ? "tablet"
                : "phone"
              : "computer",
      );
    };
    detect();
    window.addEventListener("resize", detect);
    return () => window.removeEventListener("resize", detect);
  }, [onAdmin]);
  React.useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const isDark = resolvedTheme === "dark";
  // Management Center retains its existing control and behavior.
  if (onAdmin) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={isDark ? "Açık temaya geç" : "Koyu temaya geç"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {mounted && isDark ? (
          <Sun className="size-5" aria-hidden="true" />
        ) : (
          <Moon className="size-5" aria-hidden="true" />
        )}
      </Button>
    );
  }
  const mode: Mode = mounted && modes.includes(theme as Mode) ? (theme as Mode) : "system";
  const next = modes[(modes.indexOf(mode) + 1) % modes.length];
  const selected = choices[mode];
  const Icon =
    mode === "light"
      ? Sun
      : mode === "dark"
        ? Moon
        : device === "phone"
          ? Smartphone
          : device === "tablet"
            ? Tablet
            : Monitor;
  const stopHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    press.current = null;
    setHeld(false);
  };
  return (
    <span
      className={styles.control}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={() => {
        setHover(false);
        stopHold();
      }}
    >
      {hint && (
        <span className={styles.hint} role="status" data-testid="appearance-hint">
          {choices[hint].label}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={styles.button}
        disabled={!mounted}
        aria-label={`Görünüm: ${selected.label}. ${choices[next].label}na geç`}
        aria-describedby={descriptionId}
        data-mode={mode}
        data-device={mode === "system" ? device : undefined}
        onClick={(event) => {
          const suppressed = suppressClick.current;
          suppressClick.current = false;
          // Suppress the touch compatibility click, never keyboard/assistive activation.
          if (suppressed && event.detail !== 0) return;
          setTheme(next);
          if (hintTimer.current) clearTimeout(hintTimer.current);
          setHint(null);
          try {
            const stored: unknown = JSON.parse(localStorage.getItem(hintsKey) ?? "{}");
            if (stored && typeof stored === "object") {
              for (const key of modes) {
                const count = (stored as Record<string, unknown>)[key];
                if (typeof count === "number" && Number.isInteger(count) && count >= 0)
                  counts.current[key] = Math.min(3, count);
              }
            }
          } catch {
            /* Storage failure must never block a theme change. */
          }
          if (counts.current[next] < 3) {
            counts.current[next]++;
            setHint(next);
            hintTimer.current = setTimeout(() => setHint(null), 2000);
            try {
              localStorage.setItem(hintsKey, JSON.stringify(counts.current));
            } catch {
              /* Keep the in-memory limit when local storage is unavailable. */
            }
          }
        }}
        onFocus={(event) => {
          const keyboard = event.currentTarget.matches(":focus-visible");
          setKeyboardFocus(keyboard);
          if (keyboard) setHint(null);
        }}
        onBlur={() => {
          setKeyboardFocus(false);
          stopHold();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setHover(false);
            setKeyboardFocus(false);
            stopHold();
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          suppressClick.current = false;
          setKeyboardFocus(false);
          if (event.pointerType === "mouse" || !event.isPrimary) return;
          press.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
          holdTimer.current = setTimeout(() => {
            suppressClick.current = true;
            setHint(null);
            setHeld(true);
          }, 500);
        }}
        onPointerMove={(event) => {
          if (
            press.current &&
            Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 8
          ) {
            suppressClick.current = true;
            stopHold();
          }
        }}
        onPointerUp={stopHold}
        onPointerCancel={() => {
          suppressClick.current = true;
          stopHold();
        }}
      >
        <Icon className="size-5" aria-hidden="true" />
      </Button>
      <span id={descriptionId} className="sr-only">
        {selected.description}
      </span>
      {!hint && (hover || keyboardFocus || held) && (
        <span className={styles.explanation} role="tooltip">
          {selected.description}
        </span>
      )}
    </span>
  );
}
