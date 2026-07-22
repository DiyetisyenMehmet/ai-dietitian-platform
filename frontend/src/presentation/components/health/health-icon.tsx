import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Crown,
  Droplets,
  Flag,
  Flame,
  FlaskConical,
  Footprints,
  Gauge,
  Heart,
  Lightbulb,
  MessageCircle,
  Moon,
  Scale,
  Shield,
  Sparkles,
  Star,
  Sun,
  Sunrise,
  Target,
  TrendingUp,
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
  gauge: Gauge,
  shield: Shield,
  lightbulb: Lightbulb,
  calendar: CalendarDays,
  footprints: Footprints,
  "trending-up": TrendingUp,
  star: Star,
  crown: Crown,
};

/** Resolves a HealthIconKey to its lucide icon component. */
export function healthIcon(key: HealthIconKey): LucideIcon {
  return ICONS[key];
}
