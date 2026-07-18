import { Home, UtensilsCrossed, Sparkles, Target, User, type LucideIcon } from "lucide-react";

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
  { id: "meals", label: "Öğünler", href: "/meals", icon: UtensilsCrossed },
  { id: "ai", label: "Sohbet", href: "/ai", icon: Sparkles },
  { id: "goals", label: "Hedefler", href: "/goals", icon: Target },
  { id: "profile", label: "Profil", href: "/profile", icon: User },
] as const;
