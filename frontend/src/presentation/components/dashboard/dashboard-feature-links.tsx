import Image from "next/image";
import Link from "next/link";

const FEATURES = [
  {
    title: "Besin ve Barkod Tarayıcı",
    description: "Yemeğini fotoğrafla veya paketli ürünü barkodla tara.",
    href: "/meals/scan",
    top: 21,
    height: 312,
    visual: "/images/dashboard/food-barcode-card.webp",
    lightReference: "/images/dashboard/references/food-light-final.png",
    tone: "scanner",
    lightAspect: "1603 / 400",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    top: 361,
    height: 348,
    visual: "/images/dashboard/blood-test-card.webp",
    lightReference: "/images/dashboard/references/blood-light-final.png",
    tone: "blood",
    lightAspect: "1603 / 460",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    top: 740,
    height: 298,
    visual: null,
    lightReference: null,
    tone: "progress",
    lightAspect: "1598 / 405",
  },
] as const;

type Feature = (typeof FEATURES)[number];

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[6.2cqw] w-[6.2cqw]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function ReferenceChevronOverlay({ tone }: { tone: Feature["tone"] }) {
  const patch =
    tone === "blood"
      ? {
          src: "/images/dashboard/references/blood-chevron-clean.png",
          left: 1495,
          top: 175,
          width: 90,
          height: 115,
          sourceWidth: 1603,
          sourceHeight: 460,
        }
      : {
          src: "/images/dashboard/references/food-chevron-clean.png",
          left: 1495,
          top: 145,
          width: 95,
          height: 115,
          sourceWidth: 1603,
          sourceHeight: 400,
        };

  return (
    <>
      <Image
        src={patch.src}
        alt=""
        width={patch.width}
        height={patch.height}
        unoptimized
        draggable={false}
        className="pointer-events-none absolute z-20 select-none"
        style={{
          left: `${(patch.left / patch.sourceWidth) * 100}%`,
          top: `${(patch.top / patch.sourceHeight) * 100}%`,
          width: `${(patch.width / patch.sourceWidth) * 100}%`,
          height: `${(patch.height / patch.sourceHeight) * 100}%`,
        }}
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute right-[2.2cqw] top-1/2 z-30 -translate-y-1/2 bg-transparent text-[#29425f]"
        aria-hidden="true"
      >
        <Chevron />
      </span>
    </>
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
  const isProgress = feature.tone === "progress";

  if (feature.lightReference) {
    return (
      <Link
        href={feature.href}
        className="relative block w-full overflow-hidden bg-white [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        style={{ aspectRatio: feature.lightAspect }}
        aria-label={`${feature.title}. ${feature.description}`}
      >
        <Image
          src={feature.lightReference}
          alt=""
          fill
          unoptimized
          draggable={false}
          sizes="(max-width: 768px) 100vw, 960px"
          className="pointer-events-none select-none object-fill"
          aria-hidden="true"
        />
        <ReferenceChevronOverlay tone={feature.tone} />
        <span className="sr-only">{feature.title}. {feature.description}</span>
      </Link>
    );
  }

  return (
    <Link
      href={feature.href}
      className="relative block w-full overflow-hidden rounded-[4.3cqw] border border-slate-200/75 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.055)] [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: feature.lightAspect }}
      aria-label={`${feature.title}. ${feature.description}`}
    >
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

          <span className="absolute right-[2.2cqw] top-1/2 z-30 -translate-y-1/2 text-[#29425f]" aria-hidden="true">
            <Chevron />
          </span>
        </>
      ) : null}
    </Link>
  );
}

function DarkFeatureIcon({ tone }: { tone: Feature["tone"] }) {
  const shell =
    "flex size-[13.6cqw] shrink-0 items-center justify-center rounded-[3.1cqw] border bg-[#0a2a25]/92 shadow-[inset_0_0_2.6cqw_rgba(35,228,176,0.08),0_0_2.2cqw_rgba(15,134,105,0.08)]";

  if (tone === "blood") {
    return (
      <span className={`${shell} border-emerald-300/15 text-[#ff2535]`} aria-hidden="true">
        <svg viewBox="0 0 48 48" className="size-[61%]" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M24 5C24 5 10 21 10 31a14 14 0 0 0 28 0C38 21 24 5 24 5Z" />
          <path d="M29 27c-4.5 0-8 3.2-8 7.2 0 2.7 1.5 5.1 4 6.3 5.8-.4 10.4-4.4 11.8-9.7A8 8 0 0 0 29 27Z" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  }

  if (tone === "progress") {
    return (
      <span className={`${shell} border-emerald-300/20 text-[#27e1ae]`} aria-hidden="true">
        <svg viewBox="0 0 48 48" className="size-[58%]" fill="currentColor">
          <rect x="8" y="27" width="8" height="13" rx="1.5" />
          <rect x="20" y="19" width="8" height="21" rx="1.5" />
          <rect x="32" y="9" width="8" height="31" rx="1.5" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`${shell} border-emerald-300/20 text-[#2fe0ad]`} aria-hidden="true">
      <svg viewBox="0 0 48 48" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8h-5a3 3 0 0 0-3 3v5M32 8h5a3 3 0 0 1 3 3v5M40 32v5a3 3 0 0 1-3 3h-5M16 40h-5a3 3 0 0 1-3-3v-5" />
        <path d="M17 24h14" />
      </svg>
    </span>
  );
}

function DarkProgressArtwork() {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 right-[5.4cqw] z-10 w-[41.5%]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 430 210" className="h-full w-full" fill="none" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="diewishDarkProgressBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#32efbb" stopOpacity=".98" />
            <stop offset="100%" stopColor="#0d7559" stopOpacity=".88" />
          </linearGradient>
          <linearGradient id="diewishDarkProgressWave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0d3b32" stopOpacity=".18" />
            <stop offset="50%" stopColor="#125344" stopOpacity=".5" />
            <stop offset="100%" stopColor="#0b4a3c" stopOpacity=".18" />
          </linearGradient>
          <filter id="diewishDarkProgressGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M0 177C70 161 88 80 161 84c62 3 68 37 119 25 53-13 72-63 150-67v168H0Z"
          fill="url(#diewishDarkProgressWave)"
        />

        <g fill="url(#diewishDarkProgressBar)" filter="url(#diewishDarkProgressGlow)">
          <rect x="62" y="150" width="42" height="42" rx="5" />
          <rect x="119" y="134" width="42" height="58" rx="5" />
          <rect x="176" y="112" width="42" height="80" rx="5" />
          <rect x="233" y="94" width="42" height="98" rx="5" />
          <rect x="290" y="75" width="42" height="117" rx="5" />
          <rect x="347" y="52" width="42" height="140" rx="5" />
        </g>

        <path
          d="M83 132 140 116 197 91 254 78 311 61 368 35"
          stroke="#32efbb"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#diewishDarkProgressGlow)"
        />
        <g fill="#32efbb" filter="url(#diewishDarkProgressGlow)">
          <circle cx="83" cy="132" r="8" />
          <circle cx="140" cy="116" r="8" />
          <circle cx="197" cy="91" r="8" />
          <circle cx="254" cy="78" r="8" />
          <circle cx="311" cy="61" r="8" />
          <circle cx="368" cy="35" r="8" />
        </g>

        <g transform="translate(307 2)">
          <rect width="112" height="42" rx="17" fill="#0b3d32" stroke="#1a6f5b" strokeWidth="1.2" />
          <text
            x="56"
            y="28"
            textAnchor="middle"
            fill="#35efbb"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="25"
            fontWeight="700"
          >
            -4,2 kg
          </text>
        </g>

        <g fill="#0d725a" fillOpacity=".28">
          <ellipse cx="393" cy="165" rx="13" ry="38" transform="rotate(34 393 165)" />
          <ellipse cx="417" cy="179" rx="12" ry="34" transform="rotate(38 417 179)" />
        </g>
      </svg>
    </span>
  );
}

function DarkFeatureCard({ feature }: { feature: Feature }) {
  const isProgress = feature.tone === "progress";
  const descriptionLines =
    feature.tone === "scanner"
      ? ["Yemeğini fotoğrafla veya", "paketli ürünü barkodla tara."]
      : feature.tone === "blood"
        ? ["Tahlil sonuçlarını yükle,", "anlaşılır şekilde değerlendir."]
        : ["Kilo, beslenme, su ve hareket", "verilerini incele."];

  const chevronTone =
    feature.tone === "scanner" ? "text-[#2ee3ae]" : "text-[#dbe5e2]";

  return (
    <Link
      href={feature.href}
      className="relative block w-full overflow-hidden rounded-[4.3cqw] border border-[#1b6b58]/70 bg-[#061a18] shadow-[inset_0_0_4.8cqw_rgba(15,104,83,0.08),0_1.6cqw_4.8cqw_rgba(0,0,0,0.16)] [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-inset"
      style={{ aspectRatio: feature.lightAspect }}
      aria-label={`${feature.title}. ${feature.description}`}
    >
      <span
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_80%_50%,rgba(20,107,86,0.16),transparent_36%),linear-gradient(105deg,#071a18_0%,#071c19_49%,#061715_100%)]"
        aria-hidden="true"
      />

      {feature.visual ? (
        <span
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[49%] overflow-hidden"
          style={{
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 22%, black 100%)",
            maskImage: "linear-gradient(to right, transparent 0%, black 22%, black 100%)",
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
            className="object-cover object-right saturate-[1.08] contrast-[1.06] brightness-[0.86]"
            aria-hidden="true"
          />
          <span className="absolute inset-0 bg-[linear-gradient(90deg,#061a18_0%,rgba(6,26,24,0.72)_14%,rgba(6,26,24,0.12)_42%,transparent_68%)]" />
          <span className="absolute inset-0 bg-emerald-950/10" />
        </span>
      ) : (
        <DarkProgressArtwork />
      )}

      <span className="relative z-20 flex h-full items-center gap-[2.45cqw] pl-[3.1cqw] pr-[46cqw]">
        <DarkFeatureIcon tone={feature.tone} />
        <span className="min-w-0 text-left">
          <span className="block whitespace-nowrap text-[3.1cqw] font-extrabold leading-[1.04] tracking-[-0.035em] text-white">
            {feature.title}
          </span>
          <span className="mt-[0.85cqw] block">
            {descriptionLines.map((line) => (
              <span
                key={line}
                className="block whitespace-nowrap text-[2.45cqw] font-normal leading-[1.24] tracking-[-0.012em] text-[#aab7b4]"
              >
                {line}
              </span>
            ))}
          </span>
        </span>
      </span>

      <span
        className={`pointer-events-none absolute right-[2.2cqw] top-1/2 z-30 -translate-y-1/2 bg-transparent ${chevronTone}`}
        aria-hidden="true"
      >
        <Chevron />
      </span>
    </Link>
  );
}

/**
 * Light mode remains the approved final implementation and is not changed here.
 * Dark mode mirrors the exact light-card geometry (same aspect ratios, spacing,
 * icon/text/chevron positions and routes) while applying the supplied deep
 * green/teal night palette, glow hierarchy and contrast language.
 */
export function DashboardFeatureLinks() {
  return (
    <section id="diewish-tools" className="w-full" aria-label="Diewish araçları">
      <div className="space-y-[clamp(0.45rem,1.8vw,0.8rem)] dark:hidden">
        {FEATURES.map((feature) => (
          <LightFeatureCard key={`light-${feature.href}`} feature={feature} />
        ))}
      </div>

      <div className="hidden space-y-[clamp(0.45rem,1.8vw,0.8rem)] dark:block">
        {FEATURES.map((feature) => (
          <DarkFeatureCard key={`dark-${feature.href}`} feature={feature} />
        ))}
      </div>
    </section>
  );
}
