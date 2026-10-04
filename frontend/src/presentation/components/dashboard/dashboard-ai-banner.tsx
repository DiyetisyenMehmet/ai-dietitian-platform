import Link from "next/link";
import { ChevronRight } from "lucide-react";

function DiewishMascot({ gradientId }: { gradientId: string }) {
  return (
    <span
      className="relative flex size-[4.25rem] shrink-0 items-center justify-center overflow-visible"
      aria-hidden="true"
    >
      <span
        className="pointer-events-none absolute -top-[9px] left-1/2 z-30 h-[22px] w-[26px] -translate-x-1/2"
        aria-hidden="true"
      >
        <svg viewBox="0 0 32 28" className="h-full w-full overflow-visible" fill="none">
          <defs>
            <linearGradient
              id={`${gradientId}-diewishLeafLeft`}
              x1="5"
              y1="3"
              x2="16"
              y2="13"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#5EE0AE" />
              <stop offset="1" stopColor="#149A73" />
            </linearGradient>
            <linearGradient
              id={`${gradientId}-diewishLeafRight`}
              x1="27"
              y1="2"
              x2="16"
              y2="12"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#70E8B8" />
              <stop offset="1" stopColor="#0D8F69" />
            </linearGradient>
          </defs>
          <path
            d="M16 26C16.2 20.7 15.8 15.5 16.3 10.2"
            stroke="#168D69"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M15.8 11.6C11.2 12.1 6.6 9.4 5.1 4.1C10.2 2.8 14.9 5.9 15.8 11.6Z"
            fill={`url(#${gradientId}-diewishLeafLeft)`}
          />
          <path
            d="M16.4 9.9C17.7 5.2 21.9 2.1 27.1 2.9C26.3 8 22.1 11.2 16.4 9.9Z"
            fill={`url(#${gradientId}-diewishLeafRight)`}
          />
          <path
            d="M7.1 5.2C9.7 6.8 12.1 8.5 14.7 10.6"
            stroke="#D8FFF0"
            strokeOpacity=".58"
            strokeWidth=".8"
            strokeLinecap="round"
          />
          <path
            d="M25.2 4.2C22.7 5.6 20.4 7.2 17.5 9.1"
            stroke="#D8FFF0"
            strokeOpacity=".55"
            strokeWidth=".8"
            strokeLinecap="round"
          />
          <path
            d="M10.1 6.9L9.5 9.2M22.5 6.1L23.2 8"
            stroke="#0B7659"
            strokeOpacity=".45"
            strokeWidth=".7"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <span className="absolute -left-1 top-1/2 h-7 w-2 -translate-y-1/2 rounded-l-full bg-slate-300 shadow-sm" />
      <span className="absolute -right-1 top-1/2 h-7 w-2 -translate-y-1/2 rounded-r-full bg-slate-300 shadow-sm" />

      <span className="relative z-20 flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-white via-sky-50 to-emerald-50 shadow-md ring-1 ring-slate-200/70">
        <span className="relative flex h-9 w-11 items-center justify-center rounded-xl bg-slate-950 shadow-inner">
          <span className="absolute left-2.5 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
          <span className="absolute bottom-2 h-1.5 w-4 rounded-b-full border-b-2 border-emerald-400" />
        </span>
      </span>
    </span>
  );
}

/** Content and CTA share a wrapping flow in both themes. */
export function DashboardAiBanner({ locale = "tr" }: { locale?: "tr" | "en" } = {}) {
  const copy =
    locale === "en"
      ? {
          title: "Diewish Is Always With You",
          description: "Here for a healthier you.",
          action: "Ask Now",
          label: "Diewish Coach",
        }
      : {
          title: "Diewish Her Zaman Yanında",
          description: "Daha sağlıklı bir sen için buradayım.",
          action: "Hemen Sor",
          label: "Diewish Koç",
        };
  return (
    <section aria-label={copy.label}>
      <div
        className="dashboard-coach-banner"
        data-dashboard-coach-banner
        data-dashboard-responsive-surface=""
      >
        <DiewishMascot gradientId="dashboard-ai" />
        <div className="dashboard-coach-body">
          <div className="dashboard-coach-copy" data-dashboard-decorative-text="">
            <h2 className="dashboard-card-title">{copy.title}</h2>
            <p className="dashboard-card-description">{copy.description}</p>
          </div>
          <Link href="/ai" className="dashboard-coach-action">
            <span>{copy.action}</span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
