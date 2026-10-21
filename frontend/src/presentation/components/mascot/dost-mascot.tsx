"use client";

import Image from "next/image";
import { cn } from "@/shared/lib/utils";
import styles from "./mirmir-mascot.module.css";

/** The original collection contains one Dost pose; do not invent a blink frame. */
export function DostMascot({ className }: { className?: string }) {
  return (
    <span
      className={cn(styles.mascot, "size-14", className)}
      aria-hidden="true"
      data-mascot="dost"
      data-blinking="false"
    >
      <Image
        src="/images/mascots/dost/still.webp"
        alt=""
        width={512}
        height={512}
        unoptimized
        draggable={false}
        className={styles.frame}
      />
    </span>
  );
}
