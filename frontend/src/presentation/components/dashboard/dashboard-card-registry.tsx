import {
  BarChart3,
  Bot,
  Droplets,
  ScanLine,
  type LucideIcon,
} from "lucide-react";

import type { DashboardCardId } from "@/domain/account/dashboard-card-preferences";
import { DashboardAiBanner } from "@/presentation/components/dashboard/dashboard-ai-banner";
import {
  DashboardFeatureCard,
  type DashboardFeatureLinkKind,
} from "@/presentation/components/dashboard/dashboard-feature-links";
import { cn } from "@/shared/lib/utils";

export interface DashboardCardRegistryEntry {
  id: DashboardCardId;
  label: string;
  Icon: LucideIcon;
  iconClass: string;
  iconWrapClass: string;
}

export const DASHBOARD_CARD_REGISTRY: readonly DashboardCardRegistryEntry[] = [
  {
    id: "food",
    label: "Besin ve Barkod Tarayıcı",
    Icon: ScanLine,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    iconWrapClass: "bg-emerald-500/10",
  },
  {
    id: "blood",
    label: "Kan Tahlili Analizi",
    Icon: Droplets,
    iconClass: "text-rose-500",
    iconWrapClass: "bg-rose-500/10",
  },
  {
    id: "progress",
    label: "İlerlememi Gör",
    Icon: BarChart3,
    iconClass: "text-primary",
    iconWrapClass: "bg-primary/10",
  },
  {
    id: "coach",
    label: "Diewish Her Zaman Yanında",
    Icon: Bot,
    iconClass: "text-primary",
    iconWrapClass: "bg-primary/10",
  },
];

export function dashboardCardMeta(id: DashboardCardId): DashboardCardRegistryEntry {
  const item = DASHBOARD_CARD_REGISTRY.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown Dashboard card: ${id}`);
  return item;
}

export function dashboardCardLabel(id: DashboardCardId): string {
  return dashboardCardMeta(id).label;
}

export function DashboardCardPreviewIcon({
  id,
  className,
}: {
  id: DashboardCardId;
  className?: string;
}) {
  const item = dashboardCardMeta(id);
  const Icon = item.Icon;
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-2xl",
        item.iconWrapClass,
        className,
      )}
    >
      <Icon className={cn("size-5", item.iconClass)} aria-hidden="true" />
    </span>
  );
}

export function DashboardRegisteredCard({ id, editing, saving, onHide }: {
  id: DashboardCardId;
  editing?: boolean;
  saving?: boolean;
  onHide?: () => void;
}) {
  if (id === "coach") return <DashboardAiBanner editing={editing} saving={saving} onHide={onHide} />;
  return <DashboardFeatureCard kind={id as DashboardFeatureLinkKind} />;
}
