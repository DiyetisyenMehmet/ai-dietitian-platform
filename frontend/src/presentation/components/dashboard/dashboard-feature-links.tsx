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
    darkReference: "/images/dashboard/references/food-dark-parity.png",
    darkAspect: "1469 / 354",
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
    darkReference: "/images/dashboard/references/blood-dark-parity.png",
    darkAspect: "1603 / 460",
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
    darkReference: "/images/dashboard/references/progress-dark-parity-noicon.png",
    darkAspect: "1598 / 405",
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

function DarkFeatureCard({ feature }: { feature: Feature }) {
  return (
    <Link
      href={feature.href}
      className="relative block w-full overflow-hidden [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      style={{ aspectRatio: feature.darkAspect }}
      aria-label={`${feature.title}. ${feature.description}`}
    >
      <Image
        src={feature.darkReference}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes="(max-width: 768px) 100vw, 960px"
        className="pointer-events-none select-none object-fill"
        aria-hidden="true"
      />

      {feature.tone === "progress" ? (
        <span
          className="pointer-events-none absolute left-[3.1cqw] top-1/2 z-20 -translate-y-1/2"
          aria-hidden="true"
        >
          <ProgressIcon />
        </span>
      ) : null}

      <span
        className="pointer-events-none absolute right-[2.2cqw] top-1/2 z-30 -translate-y-1/2 bg-transparent text-[#29425f]"
        aria-hidden="true"
      >
        <Chevron />
      </span>

      <span className="sr-only">
        {feature.title}. {feature.description}
      </span>
    </Link>
  );
}

/**
 * Light mode remains the approved final implementation and is not changed here.
 * Dark mode preserves the approved reference artwork while matching the
 * light-mode geometry. Progress uses the exact same live ProgressIcon component
 * as light mode; all three dark cards share the same live Chevron component.
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
