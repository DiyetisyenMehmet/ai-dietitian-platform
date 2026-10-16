"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import styles from "./mirmir-mascot.module.css";

const VIDEO = "/images/mascots/mirmir/approved-a4.mp4";
const STILL = "/images/mascots/mirmir/still-a4.png";

/** User-approved footage; no synthetic blink, breath or tail deformation. */
export function MirmirMascot({
  animationEnabled = false,
  className,
}: {
  animationEnabled?: boolean;
  className?: string;
}) {
  const element = React.useRef<HTMLSpanElement>(null);
  const video = React.useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [inViewport, setInViewport] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
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
  const shouldPlay = animationEnabled && visible && nativeActive && inViewport && !reducedMotion;
  const loadVideo = shouldPlay && !failed;
  React.useEffect(() => {
    setPlaying(false);
    const player = video.current;
    if (!loadVideo || !player) return;
    let disposed = false;
    // Set the property as well as the attribute before play() for WebView/iOS.
    player.muted = true;
    if (!player.getAttribute("src")) player.src = VIDEO;
    void player.play().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      player.pause();
      player.removeAttribute("src");
      player.load(); // Release decoder and cancel an unfinished media request.
    };
  }, [loadVideo]);
  const moving = loadVideo && playing;
  return (
    <span
      ref={element}
      className={cn(styles.mascot, "size-14", className)}
      aria-hidden="true"
      data-mascot="mirmir"
      data-moving={moving}
      data-video-state={failed ? "fallback" : moving ? "playing" : loadVideo ? "loading" : "still"}
    >
      <Image
        src={STILL}
        alt=""
        width={512}
        height={512}
        unoptimized
        draggable={false}
        className={cn(styles.frame, styles.still)}
      />
      {loadVideo && (
        <video
          ref={video}
          src={VIDEO}
          poster={STILL}
          width={1280}
          height={720}
          className={cn(styles.frame, styles.video)}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
