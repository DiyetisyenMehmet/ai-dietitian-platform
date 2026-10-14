"use client";
import type { ReactNode } from "react";
import { useMascotPreferences } from "@/application/account/mascot-preferences-provider";
import { MirmirMascot } from "./mirmir-mascot";

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
  return enabled && preferences.mascotId === "mirmir" ? (
    <MirmirMascot animationEnabled={preferences.animationEnabled} className={className} />
  ) : (
    children
  );
}
