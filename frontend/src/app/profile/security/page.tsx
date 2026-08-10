import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { SecurityView } from "@/presentation/components/profile/security-view";

export const metadata: Metadata = {
  title: "Şifre Değiştir",
};

export default function SecurityPage() {
  return (
    <AppShell title="Şifre Değiştir" showBack hideBottomNav>
      <div className="animate-fade-in">
        <SecurityView />
      </div>
    </AppShell>
  );
}
