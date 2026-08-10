import type { Metadata } from "next";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { NotificationsView } from "@/presentation/components/profile/notifications-view";

export const metadata: Metadata = {
  title: "Bildirim Tercihleri",
};

export default function NotificationsPage() {
  return (
    <AppShell title="Bildirim Tercihleri" showBack hideBottomNav>
      <div className="animate-fade-in">
        <NotificationsView />
      </div>
    </AppShell>
  );
}
