import {
  Activity,
  CheckCircle2,
  Droplets,
  Flag,
  Flame,
  FlaskConical,
  Heart,
  MessageCircle,
  Moon,
  Scale,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  Trophy,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import type { HealthIconKey } from "@/domain/health/types";

/** Maps a domain-level HealthIconKey to a concrete lucide icon component. */
const ICONS: Record<HealthIconKey, LucideIcon> = {
  user: User,
  target: Target,
  scale: Scale,
  droplet: Droplets,
  utensils: UtensilsCrossed,
  sparkles: Sparkles,
  flame: Flame,
  flag: Flag,
  trophy: Trophy,
  flask: FlaskConical,
  heart: Heart,
  activity: Activity,
  check: CheckCircle2,
  sunrise: Sunrise,
  sun: Sun,
  moon: Moon,
  message: MessageCircle,
};

/** Resolves a HealthIconKey to its lucide icon component. */
export function healthIcon(key: HealthIconKey): LucideIcon {
  return ICONS[key];
}
