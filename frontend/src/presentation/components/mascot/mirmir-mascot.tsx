"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import styles from "./mirmir-mascot.module.css";

/** Two fixed frames, no interval, video, canvas loop or image resize during a blink. */
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
  React.useEffect(() => {
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
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("diewish:app-visibility", nativeVisibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", visibility);
      observer?.disconnect();
    };
  }, []);
  const blinking =
    animationEnabled && visible && nativeActive && inViewport && openReady && closedReady;
  return (
    <span
      ref={element}
      className={cn(styles.mascot, "size-14", className)}
      aria-hidden="true"
      data-mascot="mirmir"
      data-blinking={blinking}
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
  );
}
