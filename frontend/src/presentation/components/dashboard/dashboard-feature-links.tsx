import Image from "next/image";
import Link from "next/link";

const REFERENCE_WIDTH = 1536;
const REFERENCE_HEIGHT = 1054;

const FEATURES = [
  {
    title: "Besin ve Barkod Tarayıcı",
    description: "Yemeğini fotoğrafla veya paketli ürünü barkodla tara.",
    href: "/meals/scan",
    top: 21,
    height: 312,
    visual: "/images/dashboard/food-barcode-card.webp",
    tone: "scanner",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    top: 361,
    height: 348,
    visual: "/images/dashboard/blood-test-card.webp",
    tone: "blood",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    top: 740,
    height: 298,
    visual: null,
    tone: "progress",
  },
] as const;

function LightFeatureIcon({ tone }: { tone: (typeof FEATURES)[number]["tone"] }) {
  if (tone === "scanner") {
    return (
      <span className="flex size-[clamp(2.65rem,12.6vw,4.7rem)] shrink-0 items-center justify-center rounded-[clamp(0.75rem,3.4vw,1.35rem)] bg-emerald-50 text-emerald-500" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
          <path d="M17 9h-5a3 3 0 0 0-3 3v5M31 9h5a3 3 0 0 1 3 3v5M39 31v5a3 3 0 0 1-3 3h-5M17 39h-5a3 3 0 0 1-3-3v-5" />
          <path d="M17 24h14" />
        </svg>
      </span>
    );
  }

  if (tone === "blood") {
    return (
      <span className="flex size-[clamp(2.65rem,12.6vw,4.7rem)] shrink-0 items-center justify-center rounded-[clamp(0.75rem,3.4vw,1.35rem)] bg-rose-50 text-red-500" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M24 6C19 13 12 21 12 29a12 12 0 0 0 24 0C36 21 29 13 24 6Z" />
          <path d="M18 30c1.4 3 3.7 4.5 6.5 4.5 2 0 3.8-.7 5.2-2" />
        </svg>
      </span>
    );
  }

  return (
    <span className="flex size-[clamp(2.65rem,12.6vw,4.7rem)] shrink-0 items-center justify-center rounded-[clamp(0.75rem,3.4vw,1.35rem)] bg-emerald-50 text-emerald-600" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="size-[58%]" fill="currentColor">
        <rect x="8" y="27" width="8" height="13" rx="1.5" />
        <rect x="20" y="19" width="8" height="21" rx="1.5" />
        <rect x="32" y="9" width="8" height="31" rx="1.5" />
      </svg>
    </span>
  );
}

function LightProgressVisual() {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[49%] overflow-hidden bg-[radial-gradient(circle_at_78%_40%,rgba(16,185,129,0.12),transparent_58%)]"
      style={{
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 23%, black 100%)",
        maskImage: "linear-gradient(to right, transparent 0%, black 23%, black 100%)",
      }}
      aria-hidden="true"
    >
      <span className="absolute right-[10%] top-[8%] rounded-full bg-emerald-50/95 px-[clamp(0.28rem,1.25vw,0.55rem)] py-[clamp(0.08rem,0.35vw,0.18rem)] text-[clamp(0.52rem,2.15vw,0.78rem)] font-bold text-emerald-700 shadow-sm">
        -4,2 kg
      </span>
      <svg viewBox="0 0 300 140" className="absolute inset-x-0 bottom-0 h-[84%] w-full" fill="none" preserveAspectRatio="none">
        <rect x="30" y="94" width="27" height="32" rx="3" fill="currentColor" className="text-emerald-200/80" />
        <rect x="72" y="80" width="27" height="46" rx="3" fill="currentColor" className="text-emerald-200/80" />
        <rect x="114" y="68" width="27" height="58" rx="3" fill="currentColor" className="text-emerald-200/80" />
        <rect x="156" y="55" width="27" height="71" rx="3" fill="currentColor" className="text-emerald-200/80" />
        <rect x="198" y="40" width="27" height="86" rx="3" fill="currentColor" className="text-emerald-200/80" />
        <path d="M28 92C48 84 60 77 78 75C97 72 109 61 124 60C144 59 154 48 170 47C190 45 199 34 222 25" stroke="#10b981" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx="28" cy="92" r="5" fill="#10b981" />
        <circle cx="78" cy="75" r="5" fill="#10b981" />
        <circle cx="124" cy="60" r="5" fill="#10b981" />
        <circle cx="170" cy="47" r="5" fill="#10b981" />
        <circle cx="222" cy="25" r="5" fill="#10b981" />
      </svg>
    </span>
  );
}

/**
 * Light mode is rendered as native UI so raster text can never bleed through
 * behind the live labels. Dark mode intentionally keeps its previous geometry
 * until the approved light treatment is visually signed off.
 */
export function DashboardFeatureLinks() {
  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="space-y-[clamp(0.45rem,1.8vw,0.8rem)] dark:hidden">
        {FEATURES.map((feature) => (
          <Link
            key={`light-${feature.href}`}
            href={feature.href}
            className="relative block w-full overflow-hidden border border-slate-200/70 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.045)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            style={{
              aspectRatio: `${1430} / ${feature.height}`,
              borderRadius: "clamp(1rem, 3.2vw, 2.2rem)",
            }}
            aria-label={`${feature.title}. ${feature.description}`}
          >
            <span className="relative z-20 flex h-full w-[63%] min-w-0 items-center gap-[clamp(0.48rem,2.3vw,1.1rem)] pl-[clamp(0.6rem,3vw,1.55rem)]">
              <LightFeatureIcon tone={feature.tone} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block whitespace-nowrap text-[clamp(0.69rem,3.15vw,1.08rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-slate-950">
                  {feature.title}
                </span>
                <span className="mt-[clamp(0.12rem,0.6vw,0.32rem)] block max-w-[24rem] text-[clamp(0.55rem,2.45vw,0.82rem)] font-medium leading-[1.18] text-slate-600">
                  {feature.description}
                </span>
              </span>
            </span>

            {feature.visual ? (
              <span
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[49%] overflow-hidden"
                style={{
                  WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 23%, black 100%)",
                  maskImage: "linear-gradient(to right, transparent 0%, black 23%, black 100%)",
                }}
                aria-hidden="true"
              >
                <Image
                  src={feature.visual}
                  alt=""
                  fill
                  unoptimized
                  draggable={false}
                  sizes="(max-width: 768px) 49vw, 490px"
                  className="object-cover object-right"
                />
              </span>
            ) : (
              <LightProgressVisual />
            )}

            <span className="pointer-events-none absolute right-[clamp(0.55rem,2.2vw,1.25rem)] top-1/2 z-30 -translate-y-1/2 text-[clamp(1.15rem,4.4vw,2rem)] font-medium leading-none text-slate-700" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>

      <div
        className="relative hidden w-full dark:block"
        style={{ aspectRatio: `${REFERENCE_WIDTH} / ${REFERENCE_HEIGHT}` }}
      >
        {FEATURES.map((feature, index) => (
          <Link
            key={`dark-${feature.href}`}
            href={feature.href}
            className="absolute left-0 hidden w-full items-center overflow-hidden border border-white/10 bg-zinc-900/95 shadow-sm transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:flex"
            style={{
              top: `${(feature.top / REFERENCE_HEIGHT) * 100}%`,
              height: `${(feature.height / REFERENCE_HEIGHT) * 100}%`,
              borderRadius: "clamp(1rem, 3vw, 2.75rem)",
            }}
            aria-label={`${feature.title}. ${feature.description}`}
          >
            <div className="relative z-20 flex min-w-0 flex-1 items-center gap-[clamp(0.4rem,1.8vw,1.1rem)] pl-[clamp(0.65rem,3vw,2.1rem)] pr-[clamp(2.8rem,34%,27rem)]">
              <span
                className={
                  index === 0
                    ? "flex size-[clamp(1.75rem,7vw,4.75rem)] shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300"
                    : index === 1
                      ? "flex size-[clamp(1.75rem,7vw,4.75rem)] shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-violet-300"
                      : "flex size-[clamp(1.75rem,7vw,4.75rem)] shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sky-300"
                }
                aria-hidden="true"
              >
                {index === 0 ? (
                  <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
                    <path d="M8 9v6M11 8v8M14 9v6M17 8v8" />
                  </svg>
                ) : index === 1 ? (
                  <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
                    <path d="M7.5 15h9" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 18V6M4 18h16" />
                    <path d="m7 15 4-4 3 2 5-6" />
                    <path d="M16 7h3v3" />
                  </svg>
                )}
              </span>

              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[clamp(0.72rem,2.8vw,1.65rem)] font-semibold leading-tight tracking-[-0.02em] text-zinc-50">
                  {feature.title}
                </span>
                <span className="mt-[clamp(0.08rem,0.6vw,0.4rem)] block text-[clamp(0.56rem,1.75vw,1rem)] leading-snug text-zinc-300">
                  {feature.description}
                </span>
              </span>
            </div>

            {feature.visual ? (
              <span
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[46%]"
                style={{
                  WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 30%, black 100%)",
                  maskImage: "linear-gradient(to right, transparent 0%, black 30%, black 100%)",
                }}
                aria-hidden="true"
              >
                <Image
                  src={feature.visual}
                  alt=""
                  fill
                  unoptimized
                  draggable={false}
                  sizes="(max-width: 768px) 46vw, 460px"
                  className="object-cover object-right"
                />
                <span className="absolute inset-0 bg-gradient-to-r from-zinc-900/75 via-zinc-900/10 to-transparent" />
              </span>
            ) : (
              <span
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[44%] bg-gradient-to-l from-sky-400/[0.06] via-sky-400/[0.02] to-transparent text-sky-300/75"
                style={{
                  WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 28%, black 100%)",
                  maskImage: "linear-gradient(to right, transparent 0%, black 28%, black 100%)",
                }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 240 110" className="h-full w-full" fill="none" preserveAspectRatio="none">
                  <path d="M18 84H218M18 58H218M18 32H218" stroke="currentColor" strokeOpacity=".10" />
                  <path
                    d="M18 84C48 81 58 50 84 51C108 52 111 69 132 60C157 50 159 25 184 25C199 25 207 33 218 31"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx="218" cy="31" r="5.5" fill="currentColor" />
                </svg>
              </span>
            )}

            <span className="absolute right-[clamp(0.65rem,2.8vw,2rem)] top-1/2 z-30 -translate-y-1/2 text-[clamp(1rem,4vw,2.25rem)] leading-none text-zinc-300/80" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
