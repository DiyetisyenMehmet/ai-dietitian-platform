"use client";

import Image from "next/image";
import type { MascotId } from "@/domain/account/mascot-preferences";
import { cn } from "@/shared/lib/utils";
import { MirmirMascot, BlinkingMascot } from "./mirmir-mascot";
import { DostMascot } from "./dost-mascot";
import styles from "./mirmir-mascot.module.css";

export function CollectionMascot({
  id,
  className,
}: {
  id: Exclude<MascotId, "classic">;
  className?: string;
}) {
  if (id === "mirmir") return <MirmirMascot className={className} />;
  if (id === "dost") return <DostMascot className={className} />;
  const openSrc = `/images/mascots/${id}/still.webp`;
  if (id === "lina" || id === "bulut")
    return (
      <BlinkingMascot
        key={id}
        identity={id}
        openSrc={openSrc}
        closedSrc={`/images/mascots/${id}/eyes-closed.webp`}
        className={className}
      />
    );
  return (
    <span
      className={cn(styles.mascot, "size-14", className)}
      aria-hidden="true"
      data-mascot={id}
      data-blinking="false"
    >
      <Image
        src={openSrc}
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
