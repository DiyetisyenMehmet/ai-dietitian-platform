import {
  Droplets,
  Footprints,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import type { DashboardQuickActionId } from "@/domain/account/dashboard-card-preferences";
import { cn } from "@/shared/lib/utils";

interface QuickActionMeta {
  id: DashboardQuickActionId;
  label: string;
  Icon?: LucideIcon;
  tileClass: string;
  iconClass: string;
}

export const DASHBOARD_QUICK_ACTION_REGISTRY: readonly QuickActionMeta[] = [
  {
    id: "meal",
    label: "Öğün Ekle",
    Icon: Utensils,
    tileClass: "bg-emerald-500/[0.06]",
    iconClass: "text-emerald-500",
  },
  {
    id: "water",
    label: "Su Ekle",
    Icon: Droplets,
    tileClass: "bg-sky-500/[0.06]",
    iconClass: "text-sky-500",
  },
  {
    id: "activity",
    label: "Hareket",
    Icon: Footprints,
    tileClass: "bg-teal-500/[0.06]",
    iconClass: "text-teal-500",
  },
  {
    id: "weight",
    label: "Kilo Ekle",
    tileClass: "bg-violet-500/[0.06]",
    iconClass: "text-violet-500",
  },
];

export function dashboardQuickActionMeta(id: DashboardQuickActionId): QuickActionMeta {
  const item = DASHBOARD_QUICK_ACTION_REGISTRY.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown Dashboard quick action: ${id}`);
  return item;
}

export function DashboardQuickActionIcon({
  id,
  className,
}: {
  id: DashboardQuickActionId;
  className?: string;
}) {
  const item = dashboardQuickActionMeta(id);
  if (id === "weight") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={cn("size-6 sm:size-7", item.iconClass, className)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="3" width="16" height="18" rx="4" />
        <rect x="8" y="6" width="8" height="5" rx="2" />
        <path d="M12 8.5 14 7" />
        <path d="M8 17h8" />
      </svg>
    );
  }

  const Icon = item.Icon;
  return Icon ? (
    <Icon className={cn("size-6 sm:size-7", item.iconClass, className)} aria-hidden="true" />
  ) : null;
}
