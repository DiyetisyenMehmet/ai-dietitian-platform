import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";

/** Compact AI entry point placed after the core tracking tools. */
export function DashboardAiBanner() {
  return (
    <section aria-label="Diewish AI Koçu">
      <div className="flex items-center gap-3 rounded-3xl border border-sky-500/20 bg-gradient-to-r from-sky-500/[0.07] via-card to-emerald-500/[0.08] p-4 shadow-sm">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-emerald-500/20 text-primary">
          <Bot className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold sm:text-base">Diewish AI Koçun Yanında</h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Beslenme ve günlük hedeflerin hakkında koçuna sor.
          </p>
        </div>
        <Link
          href="/ai"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm"
        >
          Hemen Sor
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
