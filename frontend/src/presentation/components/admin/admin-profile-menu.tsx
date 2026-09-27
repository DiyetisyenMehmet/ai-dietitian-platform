"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";

import { authStore } from "@/application/auth/auth-store";
import { authClient } from "@/infrastructure/auth/auth-client";
import type { AdminSession } from "@/infrastructure/admin/admin-client";
import { Button } from "@/presentation/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
  ModalTrigger,
} from "@/presentation/components/ui/modal";

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Süper Yönetici",
  ADMIN_STAFF: "Sınırlı Yönetici",
  SUPPORT: "Destek",
  CONTENT_MANAGER: "İçerik Yöneticisi",
  FINANCE: "Finans",
  OPERATIONS: "Operasyon",
};

export function AdminProfileMenu({ session }: { session: AdminSession }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const inFlight = React.useRef(false);
  const accountSelected = React.useRef(false);
  const displayName = session.admin.fullName?.trim() || session.admin.email;
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");

  const logout = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // Reuse the same HttpOnly-cookie revocation contract as the main app.
      // Do not claim success or rehydrate a still-valid cookie on network failure.
      await authClient.logout();
      authStore.clear();
      window.location.replace("/admin/login");
    } catch {
      setError("Çıkış tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <ModalTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 shrink-0 gap-2 rounded-md px-1.5 sm:px-2"
          aria-label={`Yönetici profili: ${displayName}`}
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-bold"
          >
            {initials}
          </span>
          <span className="hidden max-w-40 truncate text-sm xl:block">{displayName}</span>
          <ChevronDown aria-hidden="true" className="hidden sm:block" />
        </Button>
      </ModalTrigger>
      <ModalContent
        className="left-auto right-[max(0.75rem,env(safe-area-inset-right))] top-[calc(var(--admin-header-height,4rem)+0.5rem+env(safe-area-inset-top))] max-h-[calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-sm translate-x-0 translate-y-0 overflow-y-auto rounded-lg p-5"
        onCloseAutoFocus={(event) => {
          if (!accountSelected.current) return;
          accountSelected.current = false;
          const section = document.getElementById("admin-account-security");
          if (section) {
            event.preventDefault();
            section.scrollIntoView({ block: "start" });
            section.focus({ preventScroll: true });
          }
        }}
      >
        <div className="min-w-0 pr-6">
          <ModalTitle className="text-sm">Yönetici profili</ModalTitle>
          <ModalDescription className="sr-only">
            Hesap bilgileri, güvenlik ayarları ve güvenli çıkış.
          </ModalDescription>
          <p className="mt-4 break-words text-sm font-semibold [overflow-wrap:anywhere]">
            {displayName}
          </p>
          <p className="mt-1 break-all text-xs text-foreground/70">{session.admin.email}</p>
          <p className="mt-2 break-words text-xs text-foreground/70 [overflow-wrap:anywhere]">
            {session.roles.map((role) => roleLabels[role] || role).join(", ") || "Rol atanmamış"}
          </p>
        </div>
        <div className="space-y-1 border-t border-border pt-3">
          <Button
            variant="ghost"
            className="w-full justify-start rounded-md px-3"
            disabled={busy}
            onClick={() => {
              accountSelected.current = true;
              setOpen(false);
              router.push("/admin#admin-account-security");
            }}
          >
            <ShieldCheck aria-hidden="true" /> Hesap ve Güvenlik
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start rounded-md px-3 text-destructive"
            isLoading={busy}
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" /> {busy ? "Çıkış yapılıyor…" : "Çıkış Yap"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
