import Link from "next/link";
import { ChevronRight, Leaf } from "lucide-react";

function DiewishMascot() {
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="absolute -left-1 top-1/2 h-7 w-2 -translate-y-1/2 rounded-l-full bg-slate-300 shadow-sm dark:bg-slate-600" />
      <span className="absolute -right-1 top-1/2 h-7 w-2 -translate-y-1/2 rounded-r-full bg-slate-300 shadow-sm dark:bg-slate-600" />
      <span className="relative flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-white via-sky-50 to-emerald-50 shadow-md ring-1 ring-slate-200/70 dark:from-slate-800 dark:via-slate-900 dark:to-emerald-950 dark:ring-slate-700">
        <span className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2">
          <span className="absolute left-0 top-1 h-2 w-3 rotate-[-28deg] rounded-full bg-emerald-500" />
          <span className="absolute right-0 top-0 h-2 w-3 rotate-[30deg] rounded-full bg-emerald-400" />
          <span className="absolute left-1/2 top-2 h-2 w-0.5 -translate-x-1/2 bg-emerald-600" />
        </span>
        <span className="relative flex h-8 w-10 items-center justify-center rounded-xl bg-slate-950 shadow-inner">
          <span className="absolute left-2.5 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="absolute bottom-2 h-1.5 w-4 rounded-b-full border-b-2 border-emerald-400" />
        </span>
      </span>
    </span>
  );
}

/** Compact AI entry point placed after the core tracking tools. */
export function DashboardAiBanner() {
  return (
    <section aria-label="Diewish AI Koçu">
      <div className="relative overflow-hidden rounded-3xl border border-sky-500/15 bg-gradient-to-r from-sky-500/[0.09] via-card to-emerald-500/[0.11] p-4 shadow-sm">
        <Leaf className="pointer-events-none absolute -bottom-3 right-20 size-16 rotate-[-22deg] text-emerald-400/[0.08]" aria-hidden="true" />
        <Leaf className="pointer-events-none absolute -top-5 right-2 size-14 rotate-[20deg] text-sky-400/[0.07]" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <DiewishMascot />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold sm:text-base">Diewish AI Koçun Yanında</h2>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              Beslenme ve günlük hedeflerin hakkında koçuna sor.
            </p>
          </div>
          <Link
            href="/ai"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-500/10 transition hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-300 sm:px-4 sm:text-sm"
          >
            Hemen Sor
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
