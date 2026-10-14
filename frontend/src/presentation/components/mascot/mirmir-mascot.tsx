"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import styles from "./mirmir-mascot.module.css";
import { MirmirMotion } from "./mirmir-motion";

/** Original frames; native SVG motion needs no JS timer or rendering loop. */
export function MirmirMascot({
  animationEnabled = false,
  className,
}: {
  animationEnabled?: boolean;
  className?: string;
}) {
  const element = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [inViewport, setInViewport] = React.useState(false);
  const [openReady, setOpenReady] = React.useState(false);
  const [closedReady, setClosedReady] = React.useState(false);
  const [nativeActive, setNativeActive] = React.useState(true);
  const [reducedMotion, setReducedMotion] = React.useState(true);
  const filterId = `mirmir-motion-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionPreference = () => setReducedMotion(media.matches);
    motionPreference();
    media.addEventListener("change", motionPreference);
    const visibility = () => setVisible(document.visibilityState === "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const nativeVisibility = (event: Event) =>
      setNativeActive(Boolean((event as CustomEvent<{ active: boolean }>).detail?.active));
    const hide = () => setVisible(false);
    window.addEventListener("diewish:app-visibility", nativeVisibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", visibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting));
    if (element.current) observer?.observe(element.current);
    // Unsupported intersection detection intentionally leaves the mascot still.
    return () => {
      media.removeEventListener("change", motionPreference);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("diewish:app-visibility", nativeVisibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", visibility);
      observer?.disconnect();
    };
  }, []);
  const blinking =
    animationEnabled && visible && nativeActive && inViewport && openReady && closedReady;
  const moving = blinking && !reducedMotion;
  return (
    <span
      ref={element}
      className={cn(styles.mascot, "size-14", className)}
      aria-hidden="true"
      data-mascot="mirmir"
      data-blinking={blinking}
      data-moving={moving}
    >
      <MirmirMotion id={filterId} active={moving} />
      <span
        className={styles.motionLayer}
        style={moving ? { filter: `url(#${filterId})` } : undefined}
      >
        <Image
          src="/images/mascots/mirmir/eyes-open.webp"
          alt=""
          width={512}
          height={512}
          unoptimized
          draggable={false}
          onLoad={() => setOpenReady(true)}
          className={cn(styles.frame, styles.open)}
        />
        {animationEnabled && (
          <Image
            src="/images/mascots/mirmir/eyes-closed.webp"
            alt=""
            width={512}
            height={512}
            unoptimized
            draggable={false}
            onLoad={() => setClosedReady(true)}
            onError={() => setClosedReady(false)}
            className={cn(styles.frame, styles.closed)}
          />
        )}
      </span>
    </span>
  );
}
