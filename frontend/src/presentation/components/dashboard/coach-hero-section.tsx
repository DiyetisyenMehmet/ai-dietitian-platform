"use client";

import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";

import { Button } from "@/presentation/components/ui/button";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useNextAction } from "@/application/health/coach";

/**
 * A single, calm coach priority. Weight/progress statistics live in Progress;
 * the dashboard uses this space only to answer "what matters most right now?".
 */
export function CoachHeroSection() {
  const action = useNextAction();
  const PriorityIcon = healthIcon(action?.icon ?? "sparkles");
  const ctaLabel = action?.actionLabel ?? "Koçla konuş";
  const ctaHref = action?.actionHref ?? "/ai";

  return (
    <section aria-label="AI Koç önerisi" className="animate-scale-in">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Bot className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Koçundan bugünün önerisi</p>
            <p className="text-xs text-muted-foreground">Tek bir öncelikle başla</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border/60 bg-background/70 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PriorityIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{action?.title ?? "Bugünkü takibini sürdür"}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {action?.message ??
                "Öğünlerini ve suyunu kaydet. Bir konuda desteğe ihtiyacın varsa koçuna sorabilirsin."}
            </p>
          </div>
        </div>

        <Button asChild size="lg" className="mt-4 w-full">
          <Link href={ctaHref}>
            {ctaLabel}
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
