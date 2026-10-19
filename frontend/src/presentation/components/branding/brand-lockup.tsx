import Image from "next/image";

import { APP_CONFIG } from "@/shared/constants/app";
import styles from "./brand-lockup.module.css";

/** The owner-approved symbol and transparent wordmark; never redraw the logo. */
export function BrandLockup() {
  return (
    <span className={styles.brand} data-testid="diewish-brand">
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
          className={`${styles.name} dark:rounded-md dark:bg-white dark:px-1.5 dark:py-0.5`}
        />
        <span className={styles.tagline}>Sağlığın için, her zaman yanında.</span>
      </span>
    </span>
  );
}
