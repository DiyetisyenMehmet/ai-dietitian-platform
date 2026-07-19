"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ScanLine, Sparkles, Droplets, type LucideIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import {
  dailyTrackingStore,
  useDailyTracking,
  WATER_GLASS_ML,
} from "@/application/health/daily-tracking-store";

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  className: string;
  /** Navigation target (mutually exclusive with onClick). */
  href?: string;
  /** Inline action handler (mutually exclusive with href). */
  onClick?: () => void;
}

const CARD_CLASS =
  "flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]";

/** Rounded quick-action buttons — every action is wired to a real destination. */
export function QuickActionsSection() {
  const router = useRouter();
  const { waterMl, waterGoalMl } = useDailyTracking();

  const addWater = React.useCallback(() => {
    dailyTrackingStore.addWater();
    const total = Math.min(waterMl + WATER_GLASS_ML, waterGoalMl + WATER_GLASS_ML);
    toast.success("Su eklendi", {
      description: `+${WATER_GLASS_ML} ml • Bugün toplam ${total} ml`,
    });
  }, [waterMl, waterGoalMl]);

  const actions: readonly QuickAction[] = [
    {
      id: "add-meal",
      label: "Öğün Ekle",
      icon: Plus,
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      href: "/meals/add",
    },
    {
      id: "scan-food",
      label: "Besin Tara",
      icon: ScanLine,
      className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      onClick: () => {
        toast.info("Besin tarama yakında", {
          description: "Şimdilik öğününü elle ekleyebilirsin.",
        });
        router.push("/meals/add");
      },
    },
    {
      id: "chat-ai",
      label: "Koça Sor",
      icon: Sparkles,
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      href: "/ai",
    },
    {
      id: "add-water",
      label: "Su Ekle",
      icon: Droplets,
      className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      onClick: addWater,
    },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">Hızlı Erişim</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          const inner = (
            <>
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  action.className,
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium">{action.label}</span>
            </>
          );

          if (action.href) {
            return (
              <Link key={action.id} href={action.href} className={CARD_CLASS}>
                {inner}
              </Link>
            );
          }

          return (
            <button key={action.id} type="button" onClick={action.onClick} className={CARD_CLASS}>
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}
