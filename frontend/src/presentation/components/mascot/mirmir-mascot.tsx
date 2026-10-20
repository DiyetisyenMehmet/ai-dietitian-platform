"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import styles from "./mirmir-mascot.module.css";

/** Existing transparent poses only. Video and synthetic body motion are retired. */
export function MirmirMascot({ className }: { className?: string }) {
  return (
    <BlinkingMascot
      identity="mirmir"
      openSrc="/images/mascots/mirmir/still-a4.png"
      closedSrc="/images/mascots/mirmir/eyes-closed.webp"
      className={className}
    />
  );
}

/** The existing two-frame engine; uses only original matching poses. */
export function BlinkingMascot({
  identity,
  openSrc,
  closedSrc,
  className,
}: {
  identity: string;
  openSrc: string;
  closedSrc: string;
  className?: string;
}) {
  const element = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [inViewport, setInViewport] = React.useState(false);
  const [openReady, setOpenReady] = React.useState(false);
  const [closedReady, setClosedReady] = React.useState(false);
  const [nativeActive, setNativeActive] = React.useState(true);
  const [reducedMotion, setReducedMotion] = React.useState(true);
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
    // Without viewport detection, retain the static pose.
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
    visible && nativeActive && inViewport && !reducedMotion && openReady && closedReady;
  return (
    <span
      ref={element}
      className={cn(styles.mascot, "size-14", className)}
      aria-hidden="true"
      data-mascot={identity}
      data-blinking={blinking}
    >
      <Image
        src={openSrc}
        alt=""
        width={512}
        height={512}
        unoptimized
        draggable={false}
        onLoad={() => setOpenReady(true)}
        onError={() => setOpenReady(false)}
        className={cn(styles.frame, styles.open)}
      />
      <Image
        src={closedSrc}
        alt=""
        width={512}
        height={512}
        unoptimized
        draggable={false}
        onLoad={() => setClosedReady(true)}
        onError={() => setClosedReady(false)}
        className={cn(styles.frame, styles.closed)}
      />
    </span>
  );
}
