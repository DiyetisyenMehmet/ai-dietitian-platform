"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { signInWithGoogle } from "@/infrastructure/identity/firebase-browser";
import { authErrorMessage } from "@/infrastructure/identity/auth-feedback";
import { Button } from "@/presentation/components/ui/button";

function GoogleBrandIcon() {
  return (
    // Official Google Identity branding asset, preserved without recoloring.
    // https://developers.google.com/identity/branding-guidelines
    <Image
      data-testid="google-brand-icon"
      src="/brands/google-g.png"
      alt=""
      aria-hidden="true"
      width={200}
      height={204}
      unoptimized
      className="absolute left-3 h-5 w-auto"
    />
  );
}

export function AuthAlternatives() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);

  if (pathname !== "/login" && pathname !== "/register") return null;

  const signInGoogle = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const firebaseToken = await signInWithGoogle();
      const session = await identityClient.external(firebaseToken);
      authStore.setSession(session);
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      toast.error("Google ile giriş yapılamadı.", {
        description: authErrorMessage(error),
      });
    } finally {
      inFlight.current = false;
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
        className="relative w-full border-[#747775] bg-white px-12 text-sm font-medium text-[#1f1f1f] shadow-none hover:bg-[#f8f9fa] hover:text-[#1f1f1f] dark:border-[#747775] dark:bg-white dark:text-[#1f1f1f] dark:hover:bg-[#f8f9fa]"
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
        disabled={busy}
        onClick={() => router.push("/phone-auth")}
      >
        <Smartphone aria-hidden="true" /> Telefon numarası ile devam et
      </Button>
    </div>
  );
}
