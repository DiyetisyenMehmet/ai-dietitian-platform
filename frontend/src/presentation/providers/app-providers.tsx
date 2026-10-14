"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";

import { RouteGuard } from "@/presentation/components/auth/route-guard";
import { PushDeviceSync } from "@/presentation/providers/push-device-sync";
import { ThemeProvider } from "@/presentation/providers/theme-provider";
import { MascotPreferencesProvider } from "@/application/account/mascot-preferences-provider";

function RuntimeUserEffects() {
  const pathname = usePathname();
  const onAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  // Management Center must not trigger normal-app push/device synchronization.
  return onAdmin || pathname === "/auth/action" ? null : <PushDeviceSync />;
}

/** Aggregates all client-side providers required by the application shell. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MascotPreferencesProvider><RouteGuard>{children}</RouteGuard></MascotPreferencesProvider>
      <RuntimeUserEffects />
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "rounded-xl" }}
      />
    </ThemeProvider>
  );
}
