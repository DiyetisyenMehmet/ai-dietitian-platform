import { notFound } from "next/navigation";
import { ALERT_CATEGORIES, type AlertCategory } from "@/domain/account/notification-alerts";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { NotificationAlertsView } from "@/presentation/components/profile/notification-alerts-view";

export default async function NotificationSoundPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!ALERT_CATEGORIES.includes(category as AlertCategory)) notFound();
  return (
    <AppShell title="Ses ve titreşim" showBack hideBottomNav>
      <NotificationAlertsView category={category as AlertCategory} />
    </AppShell>
  );
}
