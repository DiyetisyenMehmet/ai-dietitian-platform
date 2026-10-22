import Image from "next/image";
import { BrandArtwork } from "./brand-artwork";

import { APP_CONFIG } from "@/shared/constants/app";
import styles from "./brand-lockup.module.css";

/** The owner-approved symbol and transparent wordmark; never redraw the logo. */
export function BrandLockup({ variant = "default" }: { variant?: "default" | "auth" }) {
  const Wrapper = variant === "auth" ? BrandArtwork : "span";
  return (
    <Wrapper
      className={`${styles.brand}${variant === "auth" ? ` ${styles.auth}` : ""}`}
      data-testid="diewish-brand"
    >
      <Image
        src="/brands/diewish-id-transparent-approved.png"
        alt=""
        width={44}
        height={44}
        priority
        unoptimized
        className={styles.symbol}
      />
      <span className={styles.wordmark}>
        <span className={styles.name}>
          <Image
            src="/brands/diewish-wordmark-approved.png"
            alt={APP_CONFIG.name}
            width={1004}
            height={214}
            priority
            unoptimized
            className={`${styles.nameArtwork} ${styles.lightName}`}
          />
          <Image
            src="/brands/diewish-wordmark-dark-approved.png"
            alt=""
            aria-hidden="true"
            width={993}
            height={206}
            priority
            unoptimized
            className={`${styles.nameArtwork} ${styles.darkName}`}
          />
        </span>
        <span className={styles.tagline}>Sağlığın için, her zaman yanında.</span>
      </span>
    </Wrapper>
  );
}
