"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { authStore, useAuth } from "@/application/auth/auth-store";
import { consentStore, useConsentState } from "@/application/legal/consent-store";
import {
  clearHydratedProfileCaches,
  hydrateProfileFromBackend,
} from "@/application/health/profile-hydration";
import { MARKETING_ROUTES } from "@/shared/constants/site";

const APP_HOME = "/dashboard";
const CONSENT_ROUTE = "/consent";
const ONBOARDING_ROUTE = "/onboarding";

const MARKETING_ROUTE_SET = new Set<string>(MARKETING_ROUTES);
const AUTH_ROUTES = new Set<string>([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);

function isMarketing(pathname: string): boolean {
  return MARKETING_ROUTE_SET.has(pathname);
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.has(pathname);
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" aria-label="Yükleniyor" />
    </div>
  );
}

/**
 * Global session + consent + onboarding gate.
 *
 * Account creation intentionally precedes health-data consent: a user can create
 * an account without health data being processed. Before onboarding or any
 * authenticated health feature is shown, the current versions of all mandatory
 * legal documents must be granted. A later document-version bump therefore
 * routes existing users back through `/consent` before health caches rehydrate.
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user } = useAuth();
  const consentState = useConsentState();

  React.useEffect(() => {
    authStore.hydrate();
  }, []);

  const authed = status === "authenticated" && !!user;
  const onboardingDone = authed && user.onboardingCompleted;

  React.useEffect(() => {
    if (status === "authenticated" && user?.id) {
      void consentStore.hydrate(user.id);
    }
  }, [status, user?.id]);

  const consentOwnedByUser = authed && consentState.ownerId === user.id;
  const consentLoading =
    authed &&
    (!consentOwnedByUser || consentState.status === "idle" || consentState.status === "loading");
  const consentGranted =
    authed &&
    consentOwnedByUser &&
    consentState.status === "ready" &&
    consentState.consent?.allMandatoryGranted === true;

  // Only hydrate health/profile caches after current mandatory consent exists.
  React.useEffect(() => {
    if (
      status === "authenticated" &&
      user?.onboardingCompleted &&
      user.id &&
      user.fullName &&
      consentGranted
    ) {
      void hydrateProfileFromBackend(user.id, user.fullName);
    }
  }, [status, user?.id, user?.onboardingCompleted, user?.fullName, consentGranted]);

  React.useEffect(() => {
    if (status === "unauthenticated") {
      clearHydratedProfileCaches();
      consentStore.clear();
    }
  }, [status]);

  const onMarketing = isMarketing(pathname);
  const onAuthRoute = isAuthRoute(pathname);
  const onConsent = pathname === CONSENT_ROUTE;
  const onOnboarding = pathname === ONBOARDING_ROUTE;

  let redirectTo: string | null = null;
  if (!onMarketing && status !== "loading" && !consentLoading) {
    if (!authed && !onAuthRoute) {
      redirectTo = "/login";
    } else if (authed && !consentGranted && !onConsent) {
      redirectTo = CONSENT_ROUTE;
    } else if (authed && consentGranted && !onboardingDone && !onOnboarding) {
      redirectTo = ONBOARDING_ROUTE;
    } else if (
      authed &&
      consentGranted &&
      onboardingDone &&
      (onAuthRoute || onOnboarding || onConsent)
    ) {
      redirectTo = APP_HOME;
    }
  }

  React.useEffect(() => {
    if (redirectTo && redirectTo !== pathname) {
      router.replace(redirectTo);
    }
  }, [redirectTo, pathname, router]);

  // Marketing pages remain public even when a signed-in user's consent is stale.
  if (onMarketing) return <>{children}</>;

  if (status === "loading" || consentLoading || redirectTo) {
    return <Splash />;
  }

  return <>{children}</>;
}
