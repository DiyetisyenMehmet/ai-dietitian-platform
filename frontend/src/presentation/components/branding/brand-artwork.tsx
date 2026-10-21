"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";

/** Reserve the approved lockup's space and reveal its artwork as one unit. */
export function BrandArtwork(props: ComponentProps<"span">) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState("loading");

  useLayoutEffect(() => {
    let active = true;
    const images = Array.from(ref.current?.querySelectorAll("img") ?? []);
    const finish = () => {
      if (active) setState(images.every((image) => image.naturalWidth > 0) ? "ready" : "fallback");
    };
    // Cached artwork must not disappear for a frame when RouteGuard hands off
    // to AuthLayout. A layout effect runs before that new tree is painted.
    if (images.every((image) => image.complete)) finish();
    else void Promise.allSettled(images.map((image) => image.decode())).then(finish);
    return () => {
      active = false;
    };
  }, []);

  return (
    <span {...props} ref={ref} data-artwork-state={state}>
      {props.children}
      <span data-brand-fallback>Diewish</span>
    </span>
  );
}
