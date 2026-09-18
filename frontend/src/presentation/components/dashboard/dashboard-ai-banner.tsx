import Link from "next/link";
import { ChevronRight, Leaf } from "lucide-react";

function DiewishMascot({ gradientId }: { gradientId: string }) {
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center overflow-visible" aria-hidden="true">
      <span
        className="pointer-events-none absolute -top-[9px] left-1/2 z-30 h-[22px] w-[26px] -translate-x-1/2"
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 28" className="h-full w-full overflow-visible" fill="none">
          <defs>
            <linearGradient id={`${gradientId}-diewishLeafLeft`} x1="5" y1="3" x2="16" y2="13" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5EE0AE" />
              <stop offset="1" stopColor="#149A73" />
            </linearGradient>
            <linearGradient id={`${gradientId}-diewishLeafRight`} x1="27" y1="2" x2="16" y2="12" gradientUnits="userSpaceOnUse">
              <stop stopColor="#70E8B8" />
              <stop offset="1" stopColor="#0D8F69" />
            </linearGradient>
          </defs>
          <path d="M16 26C16.2 20.7 15.8 15.5 16.3 10.2" stroke="#168D69" strokeWidth="2" strokeLinecap="round" />
          <path d="M15.8 11.6C11.2 12.1 6.6 9.4 5.1 4.1C10.2 2.8 14.9 5.9 15.8 11.6Z" fill={`url(#${gradientId}-diewishLeafLeft)`} />
          <path d="M16.4 9.9C17.7 5.2 21.9 2.1 27.1 2.9C26.3 8 22.1 11.2 16.4 9.9Z" fill={`url(#${gradientId}-diewishLeafRight)`} />
          <path d="M7.1 5.2C9.7 6.8 12.1 8.5 14.7 10.6" stroke="#D8FFF0" strokeOpacity=".58" strokeWidth=".8" strokeLinecap="round" />
          <path d="M25.2 4.2C22.7 5.6 20.4 7.2 17.5 9.1" stroke="#D8FFF0" strokeOpacity=".55" strokeWidth=".8" strokeLinecap="round" />
          <path d="M10.1 6.9L9.5 9.2M22.5 6.1L23.2 8" stroke="#0B7659" strokeOpacity=".45" strokeWidth=".7" strokeLinecap="round" />
        </svg>
      </span>

      <span className="absolute -left-1 top-1/2 h-7 w-2 -translate-y-1/2 rounded-l-full bg-slate-300 shadow-sm" />
      <span className="absolute -right-1 top-1/2 h-7 w-2 -translate-y-1/2 rounded-r-full bg-slate-300 shadow-sm" />

      <span className="relative z-20 flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-white via-sky-50 to-emerald-50 shadow-md ring-1 ring-slate-200/70">
        <span className="relative flex h-8 w-10 items-center justify-center rounded-xl bg-slate-950 shadow-inner">
          <span className="absolute left-2.5 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="absolute bottom-2 h-1.5 w-4 rounded-b-full border-b-2 border-emerald-400" />
        </span>
      </span>
    </span>
  );
}

/** AI entry point with identical copy and geometry in light/dark themes. */
export function DashboardAiBanner() {
  return (
    <section aria-label="Diewish AI Koçu">
      <div
        className="relative w-full overflow-hidden rounded-[clamp(1.1rem,4vw,2rem)] border border-sky-300/25 bg-[linear-gradient(100deg,#f7fbff_0%,#f2fbff_45%,#ebfff8_100%)] shadow-sm dark:border-sky-500/15 dark:bg-[linear-gradient(100deg,rgba(14,63,78,0.52)_0%,rgba(10,45,48,0.72)_52%,rgba(8,72,56,0.48)_100%)]"
        style={{ aspectRatio: "670 / 126" }}
      >
        <Leaf className="pointer-events-none absolute -bottom-3 right-[18%] hidden size-16 rotate-[-22deg] text-emerald-400/[0.08] dark:block" aria-hidden="true" />
        <Leaf className="pointer-events-none absolute -top-5 right-2 hidden size-14 rotate-[20deg] text-sky-400/[0.07] dark:block" aria-hidden="true" />

        <span
          className="pointer-events-none absolute left-[3.1%] top-1/2 origin-center -translate-y-1/2 scale-[0.8] sm:scale-100"
          aria-hidden="true"
        >
          <DiewishMascot gradientId="dashboard-ai" />
        </span>

        <div className="absolute left-[18.5%] right-[31%] top-1/2 min-w-0 -translate-y-1/2">
          <h2 className="whitespace-nowrap text-[clamp(0.68rem,3vw,1rem)] font-extrabold leading-none tracking-[-0.025em] text-slate-950 dark:text-slate-50">
            Diewish AI Koçun Yanında
          </h2>
          <p className="mt-[clamp(0.16rem,0.7vw,0.32rem)] whitespace-nowrap text-[clamp(0.52rem,2.15vw,0.74rem)] font-medium leading-none text-slate-600 dark:text-slate-300">
            Daha sağlıklı bir sen için buradayım.
          </p>
        </div>

        <Link
          href="/ai"
          className="absolute right-[3.1%] top-1/2 inline-flex h-[50%] min-w-[23.5%] -translate-y-1/2 items-center justify-center gap-[clamp(0.08rem,0.55vw,0.3rem)] rounded-full bg-emerald-100/80 px-[clamp(0.45rem,2vw,0.9rem)] text-[clamp(0.58rem,2.45vw,0.84rem)] font-extrabold text-emerald-600 shadow-sm ring-1 ring-inset ring-emerald-200/50 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/10 dark:hover:bg-emerald-500/15"
        >
          <span className="whitespace-nowrap">Hemen Sor</span>
          <ChevronRight className="size-[clamp(0.78rem,3vw,1.05rem)] shrink-0 stroke-[2.4]" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
