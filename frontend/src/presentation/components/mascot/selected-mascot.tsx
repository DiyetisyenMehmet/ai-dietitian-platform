"use client";
import type { ReactNode } from "react";
import { useMascotPreferences } from "@/application/account/mascot-preferences-provider";
import { MirmirMascot } from "./mirmir-mascot";
import { DostMascot } from "./dost-mascot";

export function SelectedMascot({
  children,
  className,
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const { preferences } = useMascotPreferences();
  if (enabled && preferences.mascotId === "dost") return <DostMascot className={className} />;
  return enabled && preferences.mascotId === "mirmir" ? (
    <MirmirMascot className={className} />
  ) : (
    children
  );
}
