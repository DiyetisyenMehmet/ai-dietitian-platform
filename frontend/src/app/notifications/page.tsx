import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";

import { AppShell } from "@/presentation/components/layout/app-shell";
import { NotificationCenterView } from "@/presentation/components/notifications/notification-center-view";

export const metadata: Metadata = {
  title: "Bildirim Merkezi",
};

export default function NotificationCenterPage() {
  return (
    <AppShell
      title="Bildirim Merkezi"
      showBack
      hideBottomNav
      headerAction={
        <Link
          href="/profile/notifications"
          aria-label="Bildirim tercihlerini aç"
          className="flex size-10 items-center justify-center rounded-xl text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings2 className="size-5" aria-hidden="true" />
        </Link>
      }
    >
      <NotificationCenterView />
    </AppShell>
  );
}
