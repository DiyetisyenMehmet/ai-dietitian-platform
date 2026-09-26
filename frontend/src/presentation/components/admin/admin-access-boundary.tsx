"use client";

import * as React from "react";
import { Loader2, ShieldX } from "lucide-react";

import { useAuth } from "@/application/auth/auth-store";
import { authClient } from "@/infrastructure/auth/auth-client";
import {
  adminClient,
  type AdminSession,
} from "@/infrastructure/admin/admin-client";
import { AdminShell } from "@/presentation/components/admin/admin-shell";
import { Button } from "@/presentation/components/ui/button";

type State =
  | { status: "checking" }
  | { status: "allowed"; session: AdminSession }
  | { status: "denied" }
  | { status: "error" };

function AccessDenied() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md text-center" role="alert">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="size-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Erişim reddedildi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bu hesap Diewish Management Center için gerekli yetkilere sahip değil.
        </p>
      </div>
    </div>
  );
}

export function AdminAccessBoundary({
  view = "overview",
}: {
  view?: "overview" | "access" | "audit";
}) {
  const { status, user } = useAuth();
  const [state, setState] = React.useState<State>({ status: "checking" });
  const rejectingSession = React.useRef(false);

  const returnToAdminLogin = React.useCallback(async () => {
    if (rejectingSession.current) return;
    rejectingSession.current = true;
    try {
      await authClient.logout();
    } catch {
      // The in-memory session must still be cleared so the login form can recover.
    } finally {
      window.location.replace("/admin/login");
    }
  }, []);

  React.useEffect(() => {
    if (status !== "authenticated" || !user) {
      setState({ status: "checking" });
      return;
    }

    if (user.role !== "ADMIN") {
      void returnToAdminLogin();
      return;
    }

    let cancelled = false;
    setState({ status: "checking" });
    void adminClient
      .getSession()
      .then((session) => {
        if (cancelled) return;
        if (session.environment.environment === "production") {
          setState({ status: "denied" });
          return;
        }
        setState({ status: "allowed", session });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const statusCode =
          typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status: unknown }).status)
            : 0;
        if (statusCode === 401 || statusCode === 403) {
          void returnToAdminLogin();
          return;
        }
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [returnToAdminLogin, status, user]);

  if (state.status === "allowed") {
    const canOpenAccess =
      state.session.permissions.includes("admin.staff.read") &&
      state.session.permissions.includes("admin.roles.read");
    const canOpenAudit = state.session.permissions.includes("audit.read");
    if (view === "access" && !canOpenAccess) {
      return <AccessDenied />;
    }
    if (view === "audit" && !canOpenAudit) {
      return <AccessDenied />;
    }
    return <AdminShell session={state.session} view={view} />;
  }

  if (state.status === "denied") {
    return <AccessDenied />;
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-md text-center" role="alert">
          <h1 className="text-xl font-bold">Management Center doğrulanamadı</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Backend yetki ve ortam doğrulaması tamamlanamadı. Güvenlik gereği erişim kapalı tutuldu.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => window.location.reload()}>
            Tekrar dene
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2
        className="size-6 animate-spin text-primary"
        aria-label="Management Center doğrulanıyor"
      />
    </div>
  );
}
