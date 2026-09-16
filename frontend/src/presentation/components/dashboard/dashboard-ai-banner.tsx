import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Leaf } from "lucide-react";

const LIGHT_MASCOT_DATA_URI =
  "data:image/webp;base64,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";

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
        <Image
          src={LIGHT_MASCOT_DATA_URI}
          alt=""
          width={97}
          height={116}
          unoptimized
          draggable={false}
          className="pointer-events-none absolute left-[1.6%] top-[3%] h-[92%] w-[16%] select-none object-contain"
          style={{
            WebkitMaskImage: "linear-gradient(to right, black 0%, black 82%, transparent 100%)",
            maskImage: "linear-gradient(to right, black 0%, black 82%, transparent 100%)",
          }}
        />

        <div className="absolute left-[19%] top-[19%] min-w-0 pr-[31%]">
          <h2 className="whitespace-nowrap text-[clamp(0.76rem,3.15vw,1rem)] font-extrabold leading-none tracking-[-0.025em] text-slate-950">
            Diewish AI Koçun Yanında
          </h2>
          <p className="mt-[clamp(0.2rem,0.9vw,0.38rem)] whitespace-nowrap text-[clamp(0.58rem,2.4vw,0.78rem)] font-medium leading-none text-slate-600">
            Daha sağlıklı bir senin için buradayım.
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