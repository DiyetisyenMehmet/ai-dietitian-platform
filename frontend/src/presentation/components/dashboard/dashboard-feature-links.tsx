import Link from "next/link";
import {
  Barcode,
  ChevronRight,
  FlaskConical,
  ScanLine,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

interface FeatureLink {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  iconWrap: string;
  iconColor: string;
  visual: "scanner" | "blood" | "progress";
}

const APPROVED_REAL_FOOD_PHOTO =
  "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=720&q=88";

const FEATURES: FeatureLink[] = [
  {
    title: "Besin ve Barkod Tarayıcı",
    description: "Yemeğini fotoğrafla veya paketli ürünü barkodla tara.",
    href: "/meals/scan",
    icon: ScanLine,
    iconWrap: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    visual: "scanner",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    icon: FlaskConical,
    iconWrap: "bg-rose-500/10",
    iconColor: "text-rose-500",
    visual: "blood",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    icon: TrendingUp,
    iconWrap: "bg-teal-500/10",
    iconColor: "text-teal-500",
    visual: "progress",
  },
];

const softMask = {
  WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 20%, black 100%)",
  maskImage: "linear-gradient(to right, transparent 0%, black 20%, black 100%)",
};

function ScannerVisual() {
  return (
    <span className="relative h-20 w-[40%] min-w-[118px] max-w-[220px] shrink-0 overflow-hidden sm:h-24" aria-hidden="true">
      <span className="absolute inset-0 overflow-hidden" style={softMask}>
        <img
          src={APPROVED_REAL_FOOD_PHOTO}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.025]"
        />
        <span className="absolute inset-0 bg-gradient-to-r from-card/45 via-transparent to-emerald-500/[0.05]" />
      </span>

      <span className="absolute bottom-1.5 right-2 flex h-[68%] w-[30%] min-w-10 rotate-[5deg] items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 via-orange-50 to-stone-100 shadow-md ring-1 ring-black/[0.05] dark:from-amber-950/80 dark:via-stone-900 dark:to-stone-950">
        <Barcode className="w-[68%] text-slate-700 dark:text-slate-200" strokeWidth={1.7} />
      </span>
    </span>
  );
}

function BloodTestVisual() {
  const rows = [
    ["Kolesterol", "168"],
    ["Trigliserid", "102"],
    ["Kan Şekeri", "92"],
    ["Vitamin D", "23"],
  ];

  return (
    <span
      className="relative h-20 w-[40%] min-w-[118px] max-w-[220px] shrink-0 overflow-hidden bg-gradient-to-r from-transparent via-sky-50/55 to-sky-100/75 dark:via-sky-950/25 dark:to-slate-900/45 sm:h-24"
      style={softMask}
      aria-hidden="true"
    >
      <span className="absolute left-[12%] top-1/2 w-[72%] -translate-y-1/2 rotate-[-2deg] rounded-xl bg-white/95 p-2 shadow-md dark:bg-slate-950/95">
        <span className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[8px] font-bold text-slate-800 dark:text-slate-100 sm:text-[9px]">Tahlil Sonuçları</span>
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[6px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:text-[7px]">Normal</span>
        </span>
        <span className="block space-y-0.5">
          {rows.map(([label, value]) => (
            <span key={label} className="flex items-center justify-between gap-2 text-[6px] leading-tight text-slate-500 dark:text-slate-400 sm:text-[7px]">
              <span>{label}</span>
              <span className={label === "Vitamin D" ? "font-bold text-rose-500" : "font-semibold text-slate-700 dark:text-slate-200"}>{value}</span>
            </span>
          ))}
        </span>
      </span>

      <span className="absolute bottom-1 right-1.5 h-[72%] w-4 rotate-[7deg] rounded-b-lg rounded-t-md bg-gradient-to-b from-rose-500 via-rose-200 to-white/90 shadow-sm sm:w-5">
        <span className="absolute -top-1 left-1/2 h-2.5 w-[125%] -translate-x-1/2 rounded-sm bg-rose-600" />
        <span className="absolute bottom-1 left-1/2 h-[38%] w-[68%] -translate-x-1/2 rounded-b-md bg-rose-700/80" />
      </span>
    </span>
  );
}

function ProgressVisual() {
  return (
    <span
      className="relative h-20 w-[40%] min-w-[118px] max-w-[220px] shrink-0 overflow-hidden bg-gradient-to-r from-transparent via-emerald-50/55 to-emerald-100/70 dark:via-emerald-950/20 dark:to-emerald-950/35 sm:h-24"
      style={softMask}
      aria-hidden="true"
    >
      <span className="absolute bottom-2 left-[18%] right-3 flex h-[55%] items-end gap-1.5 sm:gap-2">
        {[28, 42, 51, 64, 78].map((height, index) => (
          <span
            key={height}
            className="flex-1 rounded-t-sm bg-emerald-300/45 dark:bg-emerald-500/25"
            style={{ height: `${height}%` }}
          />
        ))}
      </span>

      <svg viewBox="0 0 180 74" className="absolute inset-x-[12%] bottom-2 h-[68%] w-[80%] overflow-visible" fill="none">
        <path d="M8 58 C32 48, 46 47, 63 39 S94 38, 111 27 S140 24, 167 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-emerald-500" />
        {[8, 63, 111, 167].map((cx, index) => {
          const cy = [58, 39, 27, 8][index];
          return <circle key={cx} cx={cx} cy={cy} r="4.2" fill="currentColor" className="text-emerald-500" />;
        })}
      </svg>

      <span className="absolute right-3 top-1.5 rounded-full bg-emerald-50/95 px-2 py-1 text-[8px] font-bold text-emerald-700 shadow-sm dark:bg-emerald-950/90 dark:text-emerald-300 sm:text-[9px]">
        -4,2 kg
      </span>
    </span>
  );
}

function FeatureVisual({ visual }: { visual: FeatureLink["visual"] }) {
  if (visual === "scanner") return <ScannerVisual />;
  if (visual === "blood") return <BloodTestVisual />;
  return <ProgressVisual />;
}

/** High-value feature shortcuts. Destinations intentionally reuse existing routes instead of creating parallel flows. */
export function DashboardFeatureLinks() {
  return (
    <section id="diewish-tools" className="space-y-3" aria-label="Diewish araçları">
      {FEATURES.map((feature) => {
        const Icon = feature.icon;
        return (
          <Link
            key={feature.title}
            href={feature.href}
            className="group flex min-h-28 items-center gap-3 overflow-hidden rounded-3xl border border-border/70 bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
          >
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl sm:size-14 ${feature.iconWrap}`}>
              <Icon className={`size-6 sm:size-7 ${feature.iconColor}`} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold sm:text-base">{feature.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {feature.description}
              </p>
            </div>

            <FeatureVisual visual={feature.visual} />
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
