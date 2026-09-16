import Image from "next/image";
import Link from "next/link";

const REFERENCE_WIDTH = 1536;
const REFERENCE_HEIGHT = 1054;

// Card bounds in the approved artwork. Percentages keep both the light-theme
// hit areas and the dark-theme cards aligned at every container width.
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

const CARD_LEFT = `${(54 / REFERENCE_WIDTH) * 100}%`;
const CARD_WIDTH = `${(1430 / REFERENCE_WIDTH) * 100}%`;

/** Approved reference artwork in light mode, with native dark-mode equivalents. */
export function DashboardFeatureLinks() {
  return (
    <section
      id="diewish-tools"
      className="relative isolate w-full"
      style={{ aspectRatio: `${REFERENCE_WIDTH} / ${REFERENCE_HEIGHT}` }}
      aria-label="Diewish araçları"
    >
      {/* Light mode: preserve the supplied artwork pixel-for-pixel. */}
      <Image
        src="/images/dashboard/feature-cards-reference.jpg"
        alt=""
        width={REFERENCE_WIDTH}
        height={REFERENCE_HEIGHT}
        unoptimized
        draggable={false}
        className="pointer-events-none block h-auto w-full select-none dark:hidden"
      />

      {/* Light mode: independent accessible hit areas over the approved artwork. */}
      {FEATURES.map((feature) => (
        <Link
          key={`light-${feature.href}`}
          href={feature.href}
          className="absolute block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:hidden"
          style={{
            left: CARD_LEFT,
            width: CARD_WIDTH,
            top: `${(feature.top / REFERENCE_HEIGHT) * 100}%`,
            height: `${(feature.height / REFERENCE_HEIGHT) * 100}%`,
            borderRadius: `${(44 / 1430) * 100}% / ${(44 / feature.height) * 100}%`,
          }}
          aria-label={`${feature.title}. ${feature.description}`}
        >
          <span className="sr-only">
            {feature.title}. {feature.description}
          </span>
        </Link>
      ))}

      {/* Dark mode: do not show the white JPEG canvas. Render theme-native cards
          while reusing only the existing decorative food/blood-test assets. */}
      {FEATURES.map((feature, index) => (
        <Link
          key={`dark-${feature.href}`}
          href={feature.href}
          className="absolute hidden items-center overflow-hidden border border-white/10 bg-zinc-900/95 shadow-sm transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:flex"
          style={{
            left: CARD_LEFT,
            width: CARD_WIDTH,
            top: `${(feature.top / REFERENCE_HEIGHT) * 100}%`,
            height: `${(feature.height / REFERENCE_HEIGHT) * 100}%`,
            borderRadius: `${(44 / 1430) * 100}% / ${(44 / feature.height) * 100}%`,
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
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[42%]"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, black 24%, black 100%)",
                maskImage:
                  "linear-gradient(to right, transparent 0%, black 24%, black 100%)",
              }}
              aria-hidden="true"
            >
              <Image
                src={feature.visual}
                alt=""
                fill
                unoptimized
                draggable={false}
                sizes="(max-width: 768px) 42vw, 420px"
                className="object-cover object-center"
              />
              <span className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-zinc-900/10 to-transparent" />
            </span>
          ) : (
            <span className="pointer-events-none absolute inset-y-0 right-[7%] z-10 flex w-[24%] items-center justify-center text-sky-300/70" aria-hidden="true">
              <svg viewBox="0 0 180 90" className="h-[64%] w-full" fill="none">
                <path d="M8 71h164M8 48h164M8 25h164" stroke="currentColor" strokeOpacity=".12" />
                <path d="M10 68c25-2 35-28 57-24 18 3 20 20 38 12 17-8 22-33 39-31 10 1 15 8 26 3" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="170" cy="28" r="6" fill="currentColor" />
              </svg>
            </span>
          )}

          <span className="absolute right-[clamp(0.65rem,2.8vw,2rem)] top-1/2 z-30 -translate-y-1/2 text-[clamp(1rem,4vw,2.25rem)] leading-none text-zinc-400" aria-hidden="true">
            ›
          </span>
        </Link>
      ))}
    </section>
  );
}
