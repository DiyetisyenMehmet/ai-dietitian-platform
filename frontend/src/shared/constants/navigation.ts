import { Home, UtensilsCrossed, TrendingUp, User, type LucideIcon } from "lucide-react";

import { CoachNavIcon } from "@/shared/icons/coach-nav-icon";

export interface NavigationItem {
  /** Stable identifier for the navigation entry. */
  id: string;
  /** User-facing label. */
  label: string;
  /** App Router href. */
  href: string;
  /** Icon rendered in navigation surfaces. */
  icon: LucideIcon;
}

/**
 * Primary navigation destinations shown in the bottom navigation bar.
 * Routes themselves are implemented in later sprints.
 */
export const PRIMARY_NAVIGATION: readonly NavigationItem[] = [
  { id: "home", label: "Ana Sayfa", href: "/dashboard", icon: Home },
  { id: "meals", label: "Beslenme", href: "/meals", icon: UtensilsCrossed },
  { id: "ai", label: "Koç", href: "/ai", icon: CoachNavIcon },
  { id: "progress", label: "İlerleme", href: "/progress", icon: TrendingUp },
  { id: "profile", label: "Profil", href: "/profile", icon: User },
] as const;
