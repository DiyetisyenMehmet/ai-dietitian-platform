import Link from "next/link";
import {
  ChevronRight,
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
    icon: ScanLine,
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

function BloodDropIcon() {
  return (
    <svg
      viewBox="0 0 32 40"
      className="h-8 w-7 text-rose-500"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 2.5C13.1 8.1 4.25 17.15 4.25 25.3C4.25 32.25 9.5 37.5 16 37.5C22.5 37.5 27.75 32.25 27.75 25.3C27.75 17.15 18.9 8.1 16 2.5Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M20.7 23.35C20.7 27.4 18.2 30.1 14.8 30.1C11.95 30.1 9.85 28.25 9.85 25.55C9.85 22.75 12.8 19.75 16.1 16.25C17.1 18.8 20.7 20.65 20.7 23.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ReferenceFeatureCard({ feature }: { feature: FeatureLink }) {
  const isScanner = feature.visual === "scanner";
  const imageUrl = isScanner
    ? "/images/dashboard/food-barcode-card.webp"
    : "/images/dashboard/blood-test-card.webp";
  const aspectRatio = isScanner ? "4.56 / 1" : "4.16 / 1";

  return (
    <Link
      href={feature.href}
      aria-label={`${feature.title}. ${feature.description}`}
      className={`group relative block w-full overflow-hidden rounded-[18px] border border-border/50 shadow-sm transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isScanner
          ? "bg-card"
          : "bg-gradient-to-r from-card via-card to-sky-50/65 dark:to-sky-950/20"
      }`}
      style={{ aspectRatio }}
    >
      {/*
       * Keep the photograph in its own right-side visual layer. The background is scaled by
       * card height instead of `cover`, so the source crop is not zoomed into the text zone.
       */}
      <span
        className="absolute inset-y-0 right-0 z-0 w-[52%] bg-right bg-no-repeat"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "auto 112%",
        }}
        aria-hidden="true"
      />

      {/* Soft reference-style handoff from the white copy area into the image. */}
      <span
        className={`absolute inset-y-0 left-[47%] z-10 w-[20%] bg-gradient-to-r ${
          isScanner
            ? "from-card via-card/95 to-transparent"
            : "from-card via-sky-50/90 to-transparent dark:via-sky-950/15"
        }`}
        aria-hidden="true"
      />

      {/* Copy is isolated from the visible image area; it no longer shares the photo layer. */}
      <span className="absolute inset-y-0 left-0 z-20 flex w-[60%] items-center pl-[3%]">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-2xl sm:size-11 ${feature.iconWrap}`}
          aria-hidden="true"
        >
          {isScanner ? (
            <ScanLine className={`size-6 ${feature.iconColor}`} />
          ) : (
            <BloodDropIcon />
          )}
        </span>

        <span className="ml-3 min-w-0 sm:ml-4">
          <span className="block whitespace-nowrap text-[12px] font-bold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-sm">
            {feature.title}
          </span>
          <span className="mt-1 block text-[10.5px] leading-[1.3] text-muted-foreground sm:text-xs">
            {isScanner ? (
              <>
                <span className="block whitespace-nowrap">Yemeğini fotoğrafla veya</span>
                <span className="block whitespace-nowrap">paketli ürünü barkodla tara.</span>
              </>
            ) : (
              <>
                <span className="block whitespace-nowrap">Tahlil sonuçlarını yükle,</span>
                <span className="block whitespace-nowrap">anlaşılır şekilde değerlendir.</span>
              </>
            )}
          </span>
        </span>
      </span>

      <ChevronRight
        className="absolute right-[2.4%] top-1/2 z-30 size-[18px] -translate-y-1/2 text-slate-700/90 drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)] transition-transform group-hover:translate-x-0.5 dark:text-slate-200"
        aria-hidden="true"
      />
    </Link>
  );
}

function ProgressVisual() {
  return (
    <span
      className="relative h-20 w-[40%] min-w-[118px] max-w-[220px] shrink-0 overflow-hidden bg-gradient-to-r from-transparent via-emerald-50/55 to-emerald-100/70 dark:via-emerald-950/20 dark:to-emerald-950/35 sm:h-24"
      aria-hidden="true"
    >
      <span className="absolute bottom-2 left-[18%] right-3 flex h-[55%] items-end gap-1.5 sm:gap-2">
        {[28, 42, 51, 64, 78].map((height) => (
          <span
            key={height}
            className="flex-1 rounded-t-sm bg-emerald-300/45 dark:bg-emerald-500/25"
            style={{ height: `${height}%` }}
          />
        ))}
      </span>

      <svg
        viewBox="0 0 180 74"
        className="absolute inset-x-[12%] bottom-2 h-[68%] w-[80%] overflow-visible"
        fill="none"
      >
        <path
          d="M8 58 C32 48, 46 47, 63 39 S94 38, 111 27 S140 24, 167 8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-emerald-500"
        />
        {[8, 63, 111, 167].map((cx, index) => {
          const cy = [58, 39, 27, 8][index];
          return (
            <circle
              key={cx}
              cx={cx}
              cy={cy}
              r="4.2"
              fill="currentColor"
              className="text-emerald-500"
            />
          );
        })}
      </svg>

      <span className="absolute right-3 top-1.5 rounded-full bg-emerald-50/95 px-2 py-1 text-[8px] font-bold text-emerald-700 shadow-sm dark:bg-emerald-950/90 dark:text-emerald-300 sm:text-[9px]">
        -4,2 kg
      </span>
    </span>
  );
}

/** High-value feature shortcuts. Scanner and blood-test cards follow the approved mobile reference composition. */
export function DashboardFeatureLinks() {
  return (
    <section id="diewish-tools" className="space-y-3" aria-label="Diewish araçları">
      {FEATURES.map((feature) => {
        if (feature.visual === "scanner" || feature.visual === "blood") {
          return <ReferenceFeatureCard key={feature.title} feature={feature} />;
        }

        const Icon = feature.icon;
        return (
          <Link
            key={feature.title}
            href={feature.href}
            className="group flex min-h-28 items-center gap-3 overflow-hidden rounded-3xl border border-border/70 bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
          >
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl sm:size-14 ${feature.iconWrap}`}
            >
              <Icon
                className={`size-6 sm:size-7 ${feature.iconColor}`}
                aria-hidden="true"
              />
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold sm:text-base">{feature.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {feature.description}
              </p>
            </div>

            <ProgressVisual />
            <ChevronRight
              className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </section>
  );
}
