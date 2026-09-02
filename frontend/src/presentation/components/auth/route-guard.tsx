"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { authStore, useAuth } from "@/application/auth/auth-store";
import {
  clearHydratedProfileCaches,
  hydrateProfileFromBackend,
} from "@/application/health/profile-hydration";
import { MARKETING_ROUTES } from "@/shared/constants/site";

/** Home destination for fully onboarded, authenticated users. */
const APP_HOME = "/dashboard";

/**
 * Fully public marketing routes. Rendered immediately on server and client with
 * no auth splash and no redirect — critical for SEO and the iyzico review.
 */
const MARKETING_ROUTE_SET = new Set<string>(MARKETING_ROUTES);

/** Authentication routes: public, but off-limits once fully onboarded. */
const AUTH_ROUTES = new Set<string>([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

const ONBOARDING_ROUTE = "/onboarding";

function isMarketing(pathname: string): boolean {
  return MARKETING_ROUTE_SET.has(pathname);
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.has(pathname);
}

/** Full-screen loading state shown while the session is being resolved. */
function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" aria-label="Yükleniyor" />
    </div>
  );
}

/**
 * Global authentication + onboarding gate.
 *
 * Enforces three rules on every navigation:
 *  1. Unauthenticated users may only see public/auth routes.
 *  2. Authenticated users who have NOT completed onboarding are locked to
 *     `/onboarding` until they finish.
 *  3. Fully onboarded users are kept out of auth/onboarding routes.
 *
 * It also owns the lifecycle of user-specific browser caches: hydration is
 * keyed by authenticated user id, and caches are cleared when the session ends,
 * preventing sensitive data from one account leaking into another on the same
 * device.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user } = useAuth();

  React.useEffect(() => {
    authStore.hydrate();
  }, []);

  const authed = status === "authenticated" && !!user;
  const onboardingDone = authed && user.onboardingCompleted;

  // Backend = single source of truth: whenever a fully-onboarded session becomes
  // active, hydrate the user-specific caches. Keying by user id (not just name)
  // is essential for safe account switching on shared devices.
  React.useEffect(() => {
    if (
      status === "authenticated" &&
      user?.onboardingCompleted &&
      user.id &&
      user.fullName
    ) {
      void hydrateProfileFromBackend(user.id, user.fullName);
    }
  }, [status, user?.id, user?.onboardingCompleted, user?.fullName]);

  React.useEffect(() => {
    if (status === "unauthenticated") {
      clearHydratedProfileCaches();
    }
  }, [status]);

  const onMarketing = isMarketing(pathname);
  const onAuthRoute = isAuthRoute(pathname);
  const onOnboarding = pathname === ONBOARDING_ROUTE;

  // Decide the single allowed destination for the current session state.
  // Marketing routes are always accessible and never trigger a redirect.
  let redirectTo: string | null = null;
  if (!onMarketing && status !== "loading") {
    if (!authed && !onAuthRoute) {
      redirectTo = "/login";
    } else if (authed && !onboardingDone && !onOnboarding) {
      redirectTo = ONBOARDING_ROUTE;
    } else if (authed && onboardingDone && (onAuthRoute || onOnboarding)) {
      redirectTo = APP_HOME;
    }
  }

  React.useEffect(() => {
    if (redirectTo && redirectTo !== pathname) {
      router.replace(redirectTo);
    }
  }, [redirectTo, pathname, router]);

  // Marketing pages render real HTML immediately (server + client) so search
  // engines and reviewers never see a loading spinner.
  if (onMarketing) {
    return <>{children}</>;
  }

  // While resolving the session or performing a redirect, avoid flashing content.
  if (status === "loading" || redirectTo) {
    return <Splash />;
  }

  return <>{children}</>;
}
