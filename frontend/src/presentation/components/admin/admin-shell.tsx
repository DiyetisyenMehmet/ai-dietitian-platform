"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/presentation/components/ui/button";
import { ThemeToggle } from "@/presentation/components/layout/theme-toggle";
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
  ModalTrigger,
} from "@/presentation/components/ui/modal";
import { AdminNavigation } from "./admin-navigation";
import { AdminProfileMenu } from "./admin-profile-menu";

import type { AdminSession } from "@/infrastructure/admin/admin-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { AdminAccessManagement } from "./admin-access-management";
import { AdminAccountSecurity } from "./admin-account-security";
import { AdminUsers } from "./admin-users";
import { AdminAuditViewer } from "./admin-audit-viewer";

export function AdminShell({
  session,
  view = "overview",
  userId,
}: {
  session: AdminSession;
  view?: "overview" | "access" | "audit" | "users";
  userId?: string;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setMobileOpen(false), [pathname]);
  React.useEffect(() => {
    if (view !== "overview" || window.location.hash !== "#admin-account-security") return;
    const section = document.getElementById("admin-account-security");
    section?.scrollIntoView({ block: "start" });
    section?.focus({ preventScroll: true });
  }, [view]);
  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const environment = session.environment.environment.toUpperCase();
  const canManageStaff = session.permissions.includes("admin.staff.manage");
  const canManageRoles = session.permissions.includes("admin.roles.manage");

  return (
    <div className="min-h-dvh bg-background [--admin-header-height:calc(4rem+env(safe-area-inset-top))]">
      <a
        href="#admin-main"
        className="sr-only z-[60] rounded-xl bg-card p-3 text-sm shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring"
      >
        İçeriğe geç
      </a>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
        <div className="flex h-16 items-center gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:gap-3 lg:px-6">
          <Modal open={mobileOpen} onOpenChange={setMobileOpen}>
            <ModalTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl lg:hidden"
                aria-label="Gezinme menüsünü aç"
              >
                <Menu aria-hidden="true" />
              </Button>
            </ModalTrigger>
            <ModalContent className="left-0 top-0 flex h-dvh w-[min(20rem,calc(100%-3rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-6 overflow-y-auto rounded-r-2xl rounded-l-none border-y-0 border-l-0 bg-background/95 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] shadow-xl backdrop-blur-xl">
              <div className="pr-6">
                <ModalTitle>Diewish Yönetim</ModalTitle>
                <ModalDescription className="mt-2 text-muted-foreground">
                  Management Center · {environment}
                </ModalDescription>
              </div>
              <AdminNavigation
                permissions={session.permissions}
                view={view}
                onNavigate={() => setMobileOpen(false)}
              />
            </ModalContent>
          </Modal>
          <p className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-foreground lg:text-base">
            Diewish <span className="font-medium text-muted-foreground">Management Center</span>
          </p>
          <span
            data-testid="admin-environment-banner"
            className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-800 dark:text-amber-200 sm:px-3 sm:text-xs"
          >
            {environment}
          </span>
          <ThemeToggle />
          <AdminProfileMenu session={session} />
        </div>
      </header>
      <div className="grid min-h-[calc(100dvh-var(--admin-header-height))] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sticky top-[var(--admin-header-height)] hidden h-[calc(100dvh-var(--admin-header-height))] overflow-y-auto border-r border-border/60 bg-card/60 px-3 py-5 backdrop-blur-sm lg:block">
          <div className="rounded-2xl border border-border/60 bg-card/80 p-2 shadow-sm">
            <AdminNavigation permissions={session.permissions} view={view} />
          </div>
        </aside>
        <main
          id="admin-main"
          tabIndex={-1}
          className="min-w-0 scroll-mt-[calc(var(--admin-header-height)+1rem)] px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] focus:outline-none sm:px-6 lg:p-8"
        >
          <div className="mx-auto max-w-6xl space-y-6">
            {view === "users" ? (
              <AdminUsers userId={userId} permissions={session.permissions} />
            ) : view === "access" ? (
              <AdminAccessManagement
                currentAdminId={session.admin.id}
                canManageStaff={canManageStaff}
                canManageRoles={canManageRoles}
              />
            ) : view === "audit" ? (
              <AdminAuditViewer />
            ) : (
              <>
                <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-sm sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Genel Bakış
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight">Yönetim merkezi</h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Yönetici hesabınızı ve açılmış yönetim modüllerini buradan kontrol
                    edebilirsiniz.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border/60 bg-card/80">
                    <CardHeader>
                      <CardTitle>Yetki durumu</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        Roller:{" "}
                        <span className="font-medium">
                          {session.roles.join(", ") || "Atanmamış"}
                        </span>
                      </p>
                      <p>
                        İzinler: <span className="font-medium">{session.permissions.length}</span>
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-border/60 bg-card/80">
                    <CardHeader>
                      <CardTitle>Ortam</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        Çalışma ortamı: <span className="font-medium">{environment}</span>
                      </p>
                      <p className="break-all text-muted-foreground">
                        Sürüm: {session.environment.commit}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div
                  id="admin-account-security"
                  tabIndex={-1}
                  className="scroll-mt-[calc(var(--admin-header-height)+1rem)] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AdminAccountSecurity
                    initialEmail={session.admin.email}
                    canChangeEmail={session.roles.includes("SUPER_ADMIN")}
                  />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
