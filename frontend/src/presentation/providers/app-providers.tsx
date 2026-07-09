"use client";

import * as React from "react";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/presentation/providers/theme-provider";

/** Aggregates all client-side providers required by the application shell. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "rounded-xl" }}
      />
    </ThemeProvider>
  );
}
