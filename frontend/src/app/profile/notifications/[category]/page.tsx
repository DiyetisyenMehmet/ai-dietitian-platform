import { notFound } from "next/navigation";
import {
  NOTIFICATION_DETAILS,
  isNotificationDetailSlug,
} from "@/domain/account/notification-category";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { NotificationCategoryView } from "@/presentation/components/profile/notification-category-view";

export default async function NotificationCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!isNotificationDetailSlug(category)) notFound();
  return (
    <AppShell title={NOTIFICATION_DETAILS[category].title} showBack hideBottomNav>
      <NotificationCategoryView category={category} />
    </AppShell>
  );
}
