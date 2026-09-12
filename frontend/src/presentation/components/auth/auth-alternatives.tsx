"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import { signInWithGoogle } from "@/infrastructure/identity/firebase-browser";
import { Button } from "@/presentation/components/ui/button";

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
        className="w-full"
        isLoading={busy}
        disabled={busy}
        onClick={() => void signInGoogle()}
      >
        <LogIn aria-hidden="true" /> Google ile devam et
      </Button>

      <Button asChild variant="outline" className="w-full">
        <Link href="/phone-auth">
          <Smartphone aria-hidden="true" /> Telefon numarası ile devam et
        </Link>
      </Button>
    </div>
  );
}
