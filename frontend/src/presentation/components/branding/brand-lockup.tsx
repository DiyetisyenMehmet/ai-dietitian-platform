import Image from "next/image";

import { APP_CONFIG } from "@/shared/constants/app";
import styles from "./brand-lockup.module.css";

/** The owner-approved symbol and transparent wordmark; never redraw the logo. */
export function BrandLockup({ variant = "default" }: { variant?: "default" | "auth" }) {
  return (
    <span
      className={`${styles.brand}${variant === "auth" ? ` ${styles.auth}` : ""}`}
      data-testid="diewish-brand"
    >
      <Image
        src="/brands/diewish-id-approved.webp"
        alt=""
        width={44}
        height={44}
        priority
        unoptimized
        className={styles.symbol}
      />
      <span className={styles.wordmark}>
        <Image
          src="/brands/diewish-wordmark-approved.png"
          alt={APP_CONFIG.name}
          width={1004}
          height={214}
          priority
          unoptimized
          className={`${styles.name} dark:drop-shadow-[0_0_2px_rgba(255,255,255,0.55)]`}
        />
        <span className={styles.tagline}>Sağlığın için, her zaman yanında.</span>
      </span>
    </span>
  );
}
