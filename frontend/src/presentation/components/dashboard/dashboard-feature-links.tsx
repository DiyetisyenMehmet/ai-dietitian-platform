import Image from "next/image";
import Link from "next/link";

const REFERENCE_WIDTH = 1536;
const REFERENCE_HEIGHT = 1054;
const LIGHT_CROP_LEFT = 54;
const LIGHT_CROP_RIGHT = 52;
const LIGHT_REFERENCE_WIDTH = REFERENCE_WIDTH - LIGHT_CROP_LEFT - LIGHT_CROP_RIGHT;

// Card bounds in the approved artwork. Vertical percentages preserve the
// original reference geometry while the light-theme viewport trims only the
// baked outer horizontal gutters.
const FEATURES = [
  {
    title: "Besin ve Barkod Tarayıcı",
    description: "Yemeğini fotoğrafla veya paketli ürünü barkodla tara.",
    href: "/meals/scan",
    top: 21,
    height: 312,
    visual: "/images/dashboard/food-barcode-card.webp",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    top: 361,
    height: 348,
    visual: "/images/dashboard/blood-test-card.webp",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    top: 740,
    height: 298,
    visual: null,
  },
] as const;

const LIGHT_TEXT_COVERS = [
  "linear-gradient(to right, rgba(255,255,255,0.995) 0%, rgba(255,255,255,0.995) 84%, rgba(255,255,255,0) 100%)",
  "linear-gradient(to right, rgba(250,253,255,0.995) 0%, rgba(250,253,255,0.995) 84%, rgba(250,253,255,0) 100%)",
  "linear-gradient(to right, rgba(251,255,253,0.995) 0%, rgba(251,255,253,0.995) 84%, rgba(251,255,253,0) 100%)",
] as const;

/** Approved reference artwork in light mode, with the existing dark-mode layer preserved. */
export function DashboardFeatureLinks() {
  return (
    <section id="diewish-tools" className="isolate w-full" aria-label="Diewish araçları">
      {/* Light mode: crop only the empty side gutters baked into the approved JPG.
          The artwork itself is not regenerated or redesigned. */}
      <div
        className="relative w-full overflow-hidden dark:hidden"
        style={{ aspectRatio: `${LIGHT_REFERENCE_WIDTH} / ${REFERENCE_HEIGHT}` }}
      >
        <Image
          src="/images/dashboard/feature-cards-reference.jpg"
          alt=""
          width={REFERENCE_WIDTH}
          height={REFERENCE_HEIGHT}
          unoptimized
          draggable={false}
          className="pointer-events-none absolute top-0 h-auto max-w-none select-none"
          style={{
            left: `${-(LIGHT_CROP_LEFT / LIGHT_REFERENCE_WIDTH) * 100}%`,
            width: `${(REFERENCE_WIDTH / LIGHT_REFERENCE_WIDTH) * 100}%`,
          }}
        />

        {/* Light mode: keep the reference artwork for icons/photos/charts, but
            replace only its rasterized labels with crisp native text. */}
        {FEATURES.map((feature, index) => (
          <Link
            key={`light-${feature.href}`}
            href={feature.href}
            className="absolute left-0 block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            style={{
              top: `${(feature.top / REFERENCE_HEIGHT) * 100}%`,
              height: `${(feature.height / REFERENCE_HEIGHT) * 100}%`,
              borderRadius: `${(44 / LIGHT_REFERENCE_WIDTH) * 100}% / ${(44 / feature.height) * 100}%`,
            }}
            aria-label={`${feature.title}. ${feature.description}`}
          >
            <span
              className="pointer-events-none absolute left-[16.4%] top-[9%] z-10 h-[82%] w-[45%]"
              style={{ background: LIGHT_TEXT_COVERS[index] }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute left-[18.2%] top-1/2 z-20 w-[40.5%] -translate-y-1/2 text-left"
              aria-hidden="true"
            >
              <span className="block whitespace-nowrap text-[clamp(0.7rem,3.45vw,0.98rem)] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-950">
                {feature.title}
              </span>
              <span className="mt-[clamp(0.12rem,0.65vw,0.28rem)] block text-[clamp(0.59rem,2.85vw,0.79rem)] font-medium leading-[1.18] text-slate-600">
                {feature.description}
              </span>
            </span>
            <span className="sr-only">
              {feature.title}. {feature.description}
            </span>
          </Link>
        ))}
      </div>

      {/* Dark mode is intentionally kept on its previous geometry until the
          light-mode reference is visually approved. */}
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
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent 0%, black 30%, black 100%)",
                  maskImage:
                    "linear-gradient(to right, transparent 0%, black 30%, black 100%)",
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
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent 0%, black 28%, black 100%)",
                  maskImage:
                    "linear-gradient(to right, transparent 0%, black 28%, black 100%)",
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
