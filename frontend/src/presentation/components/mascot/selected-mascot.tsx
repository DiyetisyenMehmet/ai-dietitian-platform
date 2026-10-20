"use client";
import type { ReactNode } from "react";
import { useMascotPreferences } from "@/application/account/mascot-preferences-provider";
import { CollectionMascot } from "./collection-mascot";

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
  return enabled && preferences.mascotId !== "classic" ? (
    <CollectionMascot key={preferences.mascotId} id={preferences.mascotId} className={className} />
  ) : (
    children
  );
}
