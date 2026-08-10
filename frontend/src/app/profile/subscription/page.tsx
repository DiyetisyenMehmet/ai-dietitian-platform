import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { SubscriptionView } from "@/presentation/components/profile/subscription-view";

export const metadata: Metadata = {
  title: "Abonelik",
};

export default function SubscriptionPage() {
  return (
    <AppShell title="Abonelik" showBack hideBottomNav>
      <div className="animate-fade-in">
        <SubscriptionView />
      </div>
    </AppShell>
  );
}
