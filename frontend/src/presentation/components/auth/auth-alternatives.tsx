"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { signInWithGoogle } from "@/infrastructure/identity/firebase-browser";
import { Button } from "@/presentation/components/ui/button";

function GoogleBrandIcon() {
  return (
    <svg
      data-testid="google-brand-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="!size-5"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.34 2.98-7.39Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.92A6 6 0 0 1 6.07 12c0-.67.11-1.32.32-1.92v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.52l3.35-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.6C7.18 7.71 9.39 5.95 12 5.95Z"
      />
    </svg>
  );
}

export function AuthAlternatives() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (pathname !== "/login" && pathname !== "/register") return null;

  const signInGoogle = async () => {
    setBusy(true);
    try {
      const firebaseToken = await signInWithGoogle();
      const session = await identityClient.external(firebaseToken);
      authStore.setSession(session);
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      toast.error("Google ile giriş yapılamadı.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar deneyin.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        veya
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full border-[#dadce0] bg-white text-[#3c4043] shadow-none hover:bg-[#f8f9fa] hover:text-[#202124] dark:border-[#dadce0] dark:bg-white dark:text-[#3c4043] dark:hover:bg-[#f8f9fa]"
        isLoading={busy}
        disabled={busy}
        onClick={() => void signInGoogle()}
      >
        <GoogleBrandIcon />
        Google ile devam et
      </Button>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => router.push("/phone-auth")}
      >
        <Smartphone aria-hidden="true" /> Telefon numarası ile devam et
      </Button>
    </div>
  );
}
