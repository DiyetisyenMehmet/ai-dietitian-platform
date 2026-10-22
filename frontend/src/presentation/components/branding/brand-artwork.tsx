"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";

let decodedArtwork = false;

/** Reserve the approved lockup's space and reveal its artwork as one unit. */
export function BrandArtwork(props: ComponentProps<"span">) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState("loading");

  useLayoutEffect(() => {
    let active = true;
    const images = Array.from(ref.current?.querySelectorAll("img") ?? []);
    const finish = (ready: boolean) => {
      if (active) {
        decodedArtwork = ready;
        setState(decodedArtwork ? "ready" : "fallback");
      }
    };
    // Cached artwork must not disappear for a frame when RouteGuard hands off
    // to AuthLayout. A layout effect runs before that new tree is painted.
    if (decodedArtwork && images.every((image) => image.complete && image.naturalWidth > 0)) {
      setState("ready");
      return;
    }
    setState("loading");
    void Promise.all(images.map((image) => image.decode())).then(
      () => finish(true),
      () => finish(false),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state === "loading") return;
    const host = window as Window & {
      DiewishSystemUi?: { onLaunchFrameReady?: () => void; setDarkTheme?: (dark: boolean) => void };
    };
    // Older Android shells and browsers have no such presentation callback.
    // A bridge failure must never prevent the login form from working.
    try {
      host.DiewishSystemUi?.setDarkTheme?.(document.documentElement.classList.contains("dark"));
      host.DiewishSystemUi?.onLaunchFrameReady?.();
    } catch {
      /* Native fallback remains. */
    }
  }, [state]);

  return (
    <span {...props} ref={ref} data-artwork-state={state}>
      {props.children}
      <span data-brand-fallback>Diewish</span>
    </span>
  );
}
