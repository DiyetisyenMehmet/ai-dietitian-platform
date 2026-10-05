import type { DashboardCardId } from "@/domain/account/dashboard-card-preferences";
import { DashboardAiBanner } from "@/presentation/components/dashboard/dashboard-ai-banner";
import {
  DashboardFeatureCard,
  type DashboardFeatureLinkKind,
} from "@/presentation/components/dashboard/dashboard-feature-links";

export interface DashboardCardRegistryEntry {
  id: DashboardCardId;
  label: string;
}

export const DASHBOARD_CARD_REGISTRY: readonly DashboardCardRegistryEntry[] = [
  { id: "food", label: "Besin ve Barkod Tarayıcı" },
  { id: "blood", label: "Kan Tahlili Analizi" },
  { id: "progress", label: "İlerlememi Gör" },
  { id: "coach", label: "Koç" },
];

export function dashboardCardLabel(id: DashboardCardId): string {
  return DASHBOARD_CARD_REGISTRY.find((entry) => entry.id === id)?.label ?? id;
}

export function DashboardRegisteredCard({ id }: { id: DashboardCardId }) {
  if (id === "coach") return <DashboardAiBanner />;
  return <DashboardFeatureCard kind={id as DashboardFeatureLinkKind} />;
}
