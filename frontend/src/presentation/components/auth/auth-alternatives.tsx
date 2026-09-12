"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";

import { authStore } from "@/application/auth/auth-store";
import { identityClient } from "@/infrastructure/identity/identity-client";
import {
  isExternalAuthConfigured,
  signInWithApple,
  signInWithGoogle,
} from "@/infrastructure/identity/firebase-browser";
import { Button } from "@/presentation/components/ui/button";

export function AuthAlternatives() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = React.useState<"google" | "apple" | "guest" | null>(null);

  if (pathname !== "/login" && pathname !== "/register") return null;

  const finish = async (provider: "google" | "apple") => {
    setBusy(provider);
    try {
      const firebaseToken = provider === "google" ? await signInWithGoogle() : await signInWithApple();
      const session = await identityClient.external(firebaseToken);
      authStore.setSession(session);
      router.replace(session.user.onboardingCompleted ? "/dashboard" : "/consent");
    } catch (error) {
      toast.error(`${provider === "google" ? "Google" : "Apple"} ile giriş yapılamadı.`, {
        description: error instanceof Error ? error.message : "Lütfen tekrar deneyin.",
      });
    } finally {
      setBusy(null);
    }
  };

  const guest = async () => {
    setBusy("guest");
    try {
      const session = await identityClient.guest();
      authStore.setSession(session);
      router.replace("/guest");
    } catch (error) {
      toast.error("Misafir modu başlatılamadı.", {
        description: error instanceof Error ? error.message : "Lütfen tekrar deneyin.",
      });
    } finally {
      setBusy(null);
    }
  };

  const externalConfigured = isExternalAuthConfigured();

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        veya
        <span className="h-px flex-1 bg-border" />
      </div>

      {externalConfigured && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            isLoading={busy === "google"}
            disabled={busy !== null}
            onClick={() => void finish("google")}
          >
            <LogIn aria-hidden="true" /> Google
          </Button>
          <Button
            type="button"
            variant="outline"
            isLoading={busy === "apple"}
            disabled={busy !== null}
            onClick={() => void finish("apple")}
          >
            <LogIn aria-hidden="true" /> Apple
          </Button>
        </div>
      )}

      <Button asChild variant="outline" className="w-full">
        <Link href="/phone-auth">
          <Smartphone aria-hidden="true" /> Telefon numarası ile devam et
        </Link>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        isLoading={busy === "guest"}
        disabled={busy !== null}
        onClick={() => void guest()}
      >
        <UserRound aria-hidden="true" /> Misafir olarak devam et
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Dondurduğunuz bir hesabınız mı var?{" "}
        <Link href="/reactivate" className="font-medium text-primary hover:underline">
          Hesabı yeniden etkinleştir
        </Link>
      </p>
    </div>
  );
}
