"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { authStore, useAuth } from "@/application/auth/auth-store";

const PUBLIC_ROUTES = new Set<string>([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

const ONBOARDING_ROUTE = "/onboarding";

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname);
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" aria-label="Yükleniyor" />
    </div>
  );
}

/**
 * Global authentication + onboarding gate. Session hydration now rotates the
 * HttpOnly refresh cookie and restores only the short-lived access token into
 * memory; no authentication token is loaded from localStorage.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user } = useAuth();

  React.useEffect(() => {
    void authStore.hydrate();
  }, []);

  const authed = status === "authenticated" && !!user;
  const onboardingDone = authed && user.onboardingCompleted;
  const onPublic = isPublic(pathname);
  const onOnboarding = pathname === ONBOARDING_ROUTE;

  let redirectTo: string | null = null;
  if (status !== "loading") {
    if (!authed && !onPublic) {
      redirectTo = "/login";
    } else if (authed && !onboardingDone && !onOnboarding) {
      redirectTo = ONBOARDING_ROUTE;
    } else if (authed && onboardingDone && (onPublic || onOnboarding)) {
      redirectTo = "/";
    }
  }

  React.useEffect(() => {
    if (redirectTo && redirectTo !== pathname) {
      router.replace(redirectTo);
    }
  }, [redirectTo, pathname, router]);

  if (status === "loading" || redirectTo) {
    return <Splash />;
  }

  return <>{children}</>;
}
