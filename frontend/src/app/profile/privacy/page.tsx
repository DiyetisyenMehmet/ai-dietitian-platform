import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { PrivacyConsentView } from "@/presentation/components/profile/privacy-consent-view";

export const metadata: Metadata = {
  title: "Gizlilik ve İzinler",
};

export default function PrivacyPage() {
  return (
    <AppShell title="Gizlilik ve İzinler" showBack hideBottomNav>
      <div className="animate-fade-in">
        <PrivacyConsentView />
      </div>
    </AppShell>
  );
}
