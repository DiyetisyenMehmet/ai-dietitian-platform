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

/** AI entry point matched to the approved light reference; dark mode stays unchanged until approval. */
export function DashboardAiBanner() {
  return (
    <section aria-label="Diewish AI Koçu">
      <div
        className="relative w-full overflow-hidden rounded-[clamp(1.1rem,4vw,2rem)] border border-sky-300/25 bg-[linear-gradient(100deg,#f7fbff_0%,#f2fbff_45%,#ebfff8_100%)] shadow-sm dark:hidden"
        style={{ aspectRatio: "670 / 126" }}
      >
        <span className="pointer-events-none absolute left-[3.1%] top-1/2 origin-center -translate-y-1/2 scale-[0.8] sm:scale-100" aria-hidden="true">
          <DiewishMascot />
        </span>

        <div className="absolute left-[19%] top-[19%] min-w-0 pr-[31%]">
          <h2 className="whitespace-nowrap text-[clamp(0.76rem,3.15vw,1rem)] font-extrabold leading-none tracking-[-0.025em] text-slate-950">
            Diewish AI Koçun Yanında
          </h2>
          <p className="mt-[clamp(0.2rem,0.9vw,0.38rem)] whitespace-nowrap text-[clamp(0.58rem,2.4vw,0.78rem)] font-medium leading-none text-slate-600">
            Daha sağlıklı bir sen için buradayım.
          </p>
        </div>

        <Link
          href="/ai"
          className="absolute right-[3.1%] top-1/2 inline-flex h-[50%] min-w-[23.5%] -translate-y-1/2 items-center justify-center gap-[clamp(0.1rem,0.7vw,0.35rem)] rounded-full bg-emerald-100/80 px-[clamp(0.55rem,2.4vw,1rem)] text-[clamp(0.65rem,2.65vw,0.86rem)] font-extrabold text-emerald-600 shadow-sm ring-1 ring-inset ring-emerald-200/50 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="whitespace-nowrap">Hemen Sor</span>
          <ChevronRight className="size-[clamp(0.85rem,3.3vw,1.1rem)] stroke-[2.4]" aria-hidden="true" />
        </Link>
      </div>

      {/* Dark mode: preserve the existing implementation until light-mode approval. */}
      <div className="relative hidden overflow-hidden rounded-3xl border border-sky-500/15 bg-gradient-to-r from-sky-500/[0.09] via-card to-emerald-500/[0.11] p-4 shadow-sm dark:block">
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
