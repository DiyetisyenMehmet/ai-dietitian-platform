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
    lightAspect: "1595 / 392",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    top: 361,
    height: 348,
    visual: "/images/dashboard/blood-test-card.webp",
    tone: "blood",
    lightAspect: "1606 / 455",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    top: 740,
    height: 298,
    visual: null,
    tone: "progress",
    lightAspect: "1598 / 405",
  },
] as const;

type Feature = (typeof FEATURES)[number];

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[7.4cqw] w-[7.4cqw]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function ScannerIcon() {
  return (
    <span
      className="flex size-[13.6cqw] shrink-0 items-center justify-center rounded-[3.1cqw] bg-emerald-50/95 text-emerald-600"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        className="size-[58%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      >
        <path d="M17 9h-5a3 3 0 0 0-3 3v5M31 9h5a3 3 0 0 1 3 3v5M39 31v5a3 3 0 0 1-3 3h-5M17 39h-5a3 3 0 0 1-3-3v-5" />
        <path d="M17 24h14" />
      </svg>
    </span>
  );
}

function BloodIcon() {
  return (
    <span
      className="flex size-[13.6cqw] shrink-0 items-center justify-center rounded-[3.1cqw] bg-rose-50/95 text-red-500"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        className="size-[59%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M24 6C19 13 12 21 12 29a12 12 0 0 0 24 0C36 21 29 13 24 6Z" />
        <path d="M18 30c1.4 3 3.7 4.5 6.5 4.5 2 0 3.8-.7 5.2-2" />
      </svg>
    </span>
  );
}

function ProgressIcon() {
  return (
    <span
      className="flex size-[13.6cqw] shrink-0 items-center justify-center rounded-[3.1cqw] bg-emerald-50/95 text-emerald-600"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="size-[58%]" fill="currentColor">
        <rect x="8" y="27" width="8" height="13" rx="1.5" />
        <rect x="20" y="19" width="8" height="21" rx="1.5" />
        <rect x="32" y="9" width="8" height="31" rx="1.5" />
      </svg>
    </span>
  );
}

function ProgressArtwork() {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 right-[5.4cqw] z-10 w-[41.5%]"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 430 210"
        className="h-full w-full"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="diewishProgressBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#83e5c3" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#4fd0aa" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="diewishProgressWave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ecfff7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#cdf7e7" stopOpacity="0.78" />
          </linearGradient>
        </defs>

        <path
          d="M0 177C70 161 88 80 161 84c62 3 68 37 119 25 53-13 72-63 150-67v168H0Z"
          fill="url(#diewishProgressWave)"
        />

        <g fill="url(#diewishProgressBar)">
          <rect x="62" y="150" width="42" height="42" rx="5" />
          <rect x="119" y="134" width="42" height="58" rx="5" />
          <rect x="176" y="112" width="42" height="80" rx="5" />
          <rect x="233" y="94" width="42" height="98" rx="5" />
          <rect x="290" y="75" width="42" height="117" rx="5" />
          <rect x="347" y="52" width="42" height="140" rx="5" />
        </g>

        <path
          d="M83 132 140 116 197 91 254 78 311 61 368 35"
          stroke="#08aa82"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g fill="#08aa82">
          <circle cx="83" cy="132" r="8" />
          <circle cx="140" cy="116" r="8" />
          <circle cx="197" cy="91" r="8" />
          <circle cx="254" cy="78" r="8" />
          <circle cx="311" cy="61" r="8" />
          <circle cx="368" cy="35" r="8" />
        </g>

        <g transform="translate(307 2)">
          <rect width="112" height="42" rx="17" fill="#dff8ee" fillOpacity=".96" />
          <text
            x="56"
            y="28"
            textAnchor="middle"
            fill="#087e66"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="25"
            fontWeight="700"
          >
            -4,2 kg
          </text>
        </g>

        <g fill="#bff0df" fillOpacity=".42">
          <ellipse cx="393" cy="165" rx="13" ry="38" transform="rotate(34 393 165)" />
          <ellipse cx="417" cy="179" rx="12" ry="34" transform="rotate(38 417 179)" />
        </g>
      </svg>
    </span>
  );
}

function LightFeatureCard({ feature }: { feature: Feature }) {
  const isScanner = feature.tone === "scanner";
  const isBlood = feature.tone === "blood";
  const isProgress = feature.tone === "progress";

  return (
    <Link
      href={feature.href}
      className="relative block w-full overflow-hidden rounded-[4.3cqw] border border-slate-200/75 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.055)] [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: feature.lightAspect }}
      aria-label={`${feature.title}. ${feature.description}`}
    >
      {isScanner ? (
        <>
          <span
            className="pointer-events-none absolute inset-y-0 right-[1.6cqw] z-0 w-[50%]"
            aria-hidden="true"
          >
            <Image
              src="/images/dashboard/food-barcode-card.webp"
              alt=""
              fill
              quality={100}
              draggable={false}
              sizes="(max-width: 768px) 50vw, 470px"
              className="object-contain object-right"
              style={{ transform: "scale(0.92)", transformOrigin: "right center" }}
            />
            <span className="absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-white via-white/75 to-transparent" />
          </span>

          <span className="relative z-20 flex h-full items-center gap-[2.2cqw] pl-[3.1cqw] pr-[42cqw]">
            <ScannerIcon />
            <span className="min-w-0 text-left">
              <span className="block whitespace-nowrap text-[3.15cqw] font-extrabold leading-[1.03] tracking-[-0.035em] text-slate-950">
                Besin ve Barkod Tarayıcı
              </span>
              <span className="mt-[0.75cqw] block whitespace-nowrap text-[2.45cqw] font-normal leading-[1.24] tracking-[-0.015em] text-slate-500">
                Yemeğini fotoğrafla veya
              </span>
              <span className="block whitespace-nowrap text-[2.45cqw] font-normal leading-[1.24] tracking-[-0.015em] text-slate-500">
                paketli ürünü barkodla tara.
              </span>
            </span>
          </span>

          <span className="absolute right-[1.85cqw] top-1/2 z-30 -translate-y-1/2 text-slate-700">
            <Chevron />
          </span>
        </>
      ) : null}

      {isBlood ? (
        <>
          <span
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_82%_38%,rgba(219,238,255,0.9),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(255,224,226,0.8),transparent_28%)]"
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute inset-y-0 right-[1.8cqw] z-10 w-[48%]"
            aria-hidden="true"
          >
            <Image
              src="/images/dashboard/blood-test-card.webp"
              alt=""
              fill
              quality={100}
              draggable={false}
              sizes="(max-width: 768px) 48vw, 445px"
              className="object-contain object-right"
              style={{ transform: "scale(0.9)", transformOrigin: "right center" }}
            />
            <span className="absolute inset-y-0 left-0 w-[13%] bg-gradient-to-r from-white via-white/60 to-transparent" />
          </span>

          <span className="relative z-20 flex h-full items-center gap-[2.4cqw] pl-[3.15cqw] pr-[44cqw]">
            <BloodIcon />
            <span className="min-w-0 text-left">
              <span className="block whitespace-nowrap text-[3.65cqw] font-extrabold leading-[1.03] tracking-[-0.035em] text-slate-950">
                Kan Tahlili Analizi
              </span>
              <span className="mt-[0.8cqw] block whitespace-nowrap text-[2.75cqw] font-normal leading-[1.22] tracking-[-0.015em] text-slate-500">
                Tahlil sonuçlarını yükle,
              </span>
              <span className="block whitespace-nowrap text-[2.75cqw] font-normal leading-[1.22] tracking-[-0.015em] text-slate-500">
                anlaşılır şekilde değerlendir.
              </span>
            </span>
          </span>

          <span className="absolute right-[1.9cqw] top-1/2 z-30 -translate-y-1/2 text-slate-700">
            <Chevron />
          </span>
        </>
      ) : null}

      {isProgress ? (
        <>
          <span
            className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(115deg,#ffffff_0%,#ffffff_42%,#f5fffb_65%,#edfff8_100%)]"
            aria-hidden="true"
          />
          <span className="pointer-events-none absolute bottom-[-18%] left-[36%] z-0 h-[74%] w-[45%] rounded-[50%] bg-emerald-100/35 blur-[0.6cqw]" aria-hidden="true" />

          <ProgressArtwork />

          <span className="relative z-20 flex h-full items-center gap-[2.45cqw] pl-[3.1cqw] pr-[46cqw]">
            <ProgressIcon />
            <span className="min-w-0 text-left">
              <span className="block whitespace-nowrap text-[3.8cqw] font-extrabold leading-[1.02] tracking-[-0.04em] text-slate-950">
                İlerlememi Gör
              </span>
              <span className="mt-[0.8cqw] block whitespace-nowrap text-[2.7cqw] font-normal leading-[1.22] tracking-[-0.015em] text-slate-500">
                Kilo, beslenme, su ve hareket
              </span>
              <span className="block whitespace-nowrap text-[2.7cqw] font-normal leading-[1.22] tracking-[-0.015em] text-slate-500">
                verilerini incele.
              </span>
            </span>
          </span>

          <span className="absolute right-[1.8cqw] top-1/2 z-30 -translate-y-1/2 text-slate-700">
            <Chevron />
          </span>
        </>
      ) : null}
    </Link>
  );
}

/**
 * Light mode uses the final approved dashboard-card compositions as a stable,
 * responsive implementation. Dark mode intentionally remains unchanged until
 * its dedicated reference artwork is supplied.
 *
 * The Android app hosts this responsive web UI in its trusted WebView, so this
 * single light-mode implementation is shared by staging web and Android.
 */
export function DashboardFeatureLinks() {
  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="space-y-[clamp(0.45rem,1.8vw,0.8rem)] dark:hidden">
        {FEATURES.map((feature) => (
          <LightFeatureCard key={`light-${feature.href}`} feature={feature} />
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
