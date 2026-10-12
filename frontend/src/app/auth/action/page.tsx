"use client";

import * as React from "react";
import Link from "next/link";
import { apiRequest } from "@/infrastructure/api/http-client";

/** Project-wide Firebase callback. Only explicitly marked Admin resets enter Admin. */
export default function FirebaseActionPage() {
  const started = React.useRef(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", window.location.pathname);
    const mode = params.get("mode");
    const code = params.get("oobCode");
    if (
      !code ||
      !mode ||
      ![
        "resetPassword",
        "verifyEmail",
        "recoverEmail",
        "verifyAndChangeEmail",
        "signIn",
        "revertSecondFactorAddition",
      ].includes(mode)
    ) {
      setFailed(true);
      return;
    }
    let adminContext: "invitation" | "reset" | null = null;
    try {
      const target = new URL(params.get("continueUrl") ?? "");
      const trustedOrigin =
        target.origin === window.location.origin ||
        (window.location.origin === "https://staging.diewish.com" &&
          target.origin === "https://admin-staging.diewish.com");
      const context = target.searchParams.get("context");
      if (
        trustedOrigin &&
        target.pathname === "/admin/reset-password" &&
        mode === "resetPassword" &&
        (context === "invitation" || context === "reset")
      )
        adminContext = context;
    } catch {
      /* Missing/untrusted continuation remains a normal Firebase action. */
    }
    if (adminContext) {
      // Same-origin, in-memory handoff. The fragment is never sent to the web server.
      const fragment = new URLSearchParams({ mode, oobCode: code });
      const adminOrigin = window.location.origin === "https://staging.diewish.com" ? "https://admin-staging.diewish.com" : window.location.origin;
      window.location.replace(`${adminOrigin}/admin/reset-password#${fragment.toString()}`);
      return;
    }
    // Preserve the existing Firebase handler for non-Admin actions. Never use
    // incoming apiKey / arbitrary continueUrl as a destination or project selector.
    void apiRequest<{ configured: boolean; config: Record<string, string> | null }>({
      path: "/identity/firebase-config",
      method: "GET",
      cache: "no-store",
      retryOnUnauthorized: false,
    })
      .then((result) => {
        if (!result.configured || !result.config?.projectId || !result.config.apiKey)
          throw new Error("Unavailable");
        const host = `${result.config.projectId}.firebaseapp.com`;
        if (!/^[a-z0-9-]+\.firebaseapp\.com$/.test(host)) throw new Error("Unavailable");
        const target = new URL(`https://${host}/__/auth/action`);
        target.searchParams.set("mode", mode);
        target.searchParams.set("oobCode", code);
        target.searchParams.set("apiKey", result.config.apiKey);
        target.searchParams.set("lang", "tr");
        const continuation = params.get("continueUrl");
        if (continuation) {
          try {
            const safe = new URL(continuation);
            if (
              safe.origin === window.location.origin &&
              !safe.pathname.startsWith("/admin") &&
              safe.pathname !== "/auth/action"
            )
              target.searchParams.set("continueUrl", safe.toString());
          } catch {
            /* No untrusted redirect. */
          }
        }
        window.location.replace(target.toString());
      })
      .catch(() => setFailed(true));
  }, []);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8">
        <p className="text-xs font-bold tracking-widest text-primary">DIEWISH</p>
        <h1 className="mt-4 text-2xl font-bold">
          {failed ? "Bu bağlantı doğrulanamadı." : "Bağlantınız hazırlanıyor…"}
        </h1>
        {failed ? (
          <Link
            href="/login"
            className="mt-5 block rounded-lg text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            Giriş ekranına dön
          </Link>
        ) : (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Lütfen bekleyin.
          </p>
        )}
      </section>
    </main>
  );
}
