import Image from "next/image";

import { cn } from "@/shared/lib/utils";

const COACH_AVATAR_SRC = "/images/diewish/semantic/diewish-coach-avatar.png";

/** Diewish Coach identity avatar. Pulses gently while active. */
export function AiAvatar({ active = false, className }: { active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full shadow-soft",
        className,
      )}
    >
      {active && (
        <span
          className="absolute inset-0 animate-ping rounded-full bg-primary/35"
          aria-hidden="true"
        />
      )}
      <span className="relative flex size-full overflow-hidden rounded-full">
        <Image
          src={COACH_AVATAR_SRC}
          alt=""
          width={96}
          height={96}
          unoptimized
          draggable={false}
          aria-hidden="true"
          data-diewish-semantic-icon="coach-avatar"
          className="relative h-full w-full object-contain"
        />
      </span>
    </span>
  );
}
