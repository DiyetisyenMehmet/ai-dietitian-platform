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
 * Global session + onboarding gate with consent-aware first-run behavior.
 *
 * A NEW account cannot enter onboarding until current mandatory consent exists,
 * because onboarding itself collects health data. Once onboarding has already
 * been completed, however, withdrawing consent must NOT trap the user on a
 * consent screen. They keep access to their account and already-held data so
 * they can review/delete it or manage privacy settings. Backend guards prevent
 * new health-data writes and AI processing while consent is missing.
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

  // Hydrate health/profile caches only while current mandatory consent exists.
  // Withdrawing consent stops this automatic health-data processing, but does
  // not block navigation to account/privacy/data-management screens.
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
    } else if (authed && !onboardingDone) {
      // First run: consent must precede any health-data onboarding.
      if (!consentGranted && !onConsent) {
        redirectTo = CONSENT_ROUTE;
      } else if (consentGranted && !onOnboarding) {
        redirectTo = ONBOARDING_ROUTE;
      }
    } else if (authed && onboardingDone && (onAuthRoute || onOnboarding)) {
      // Established users may visit /consent deliberately to review/re-grant
      // consent, including after a withdrawal or legal-version change.
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
