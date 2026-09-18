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
  const isScanner = tone === "scanner";
  const sizeClass = isScanner ? "size-[12cqw]" : "size-[13.6cqw]";
  const radiusClass = isScanner ? "rounded-[2.25cqw]" : "rounded-[2.65cqw]";
  const shell =
    `flex ${sizeClass} ${radiusClass} shrink-0 items-center justify-center border bg-[#082822]/94 shadow-[inset_0_0_2.2cqw_rgba(45,239,188,0.08),0_0_2.4cqw_rgba(22,153,117,0.10)]`;

  if (tone === "blood") {
    return (
      <span className={`${shell} border-[#2c745f]/35 text-[#ff1f32]`} aria-hidden="true">
        <svg
          viewBox="0 0 48 48"
          className="size-[61%]"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M24 5C24 5 10 21 10 31a14 14 0 0 0 28 0C38 21 24 5 24 5Z" />
          <path
            d="M29 27c-4.5 0-8 3.2-8 7.2 0 2.7 1.5 5.1 4 6.3 5.8-.4 10.4-4.4 11.8-9.7A8 8 0 0 0 29 27Z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      </span>
    );
  }

  if (tone === "progress") {
    return (
      <span className={`${shell} border-[#2c745f]/40 text-[#32e9b4]`} aria-hidden="true">
        <svg viewBox="0 0 48 48" className="size-[58%]" fill="currentColor">
          <defs>
            <linearGradient id="diewishDarkProgressIconBars" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3cf1be" />
              <stop offset="100%" stopColor="#17b98c" />
            </linearGradient>
          </defs>
          <g fill="url(#diewishDarkProgressIconBars)">
            <rect x="8" y="27" width="8" height="13" rx="1.5" />
            <rect x="20" y="19" width="8" height="21" rx="1.5" />
            <rect x="32" y="9" width="8" height="31" rx="1.5" />
          </g>
        </svg>
      </span>
    );
  }

  return (
    <span className={`${shell} border-[#2c745f]/40 text-[#32e9b4]`} aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        className="size-[62%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 8h-5a3 3 0 0 0-3 3v5M32 8h5a3 3 0 0 1 3 3v5M40 32v5a3 3 0 0 1-3 3h-5M16 40h-5a3 3 0 0 1-3-3v-5" />
        <path d="M17 24h14" />
      </svg>
    </span>
  );
}

function DarkProgressArtwork() {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 right-[5.35cqw] z-10 w-[41.6%]"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 430 210"
        className="h-full w-full"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="diewishDarkProgressBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#39efbd" stopOpacity=".98" />
            <stop offset="100%" stopColor="#0f7b5e" stopOpacity=".90" />
          </linearGradient>
          <linearGradient id="diewishDarkProgressWave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0a352d" stopOpacity=".12" />
            <stop offset="52%" stopColor="#155646" stopOpacity=".55" />
            <stop offset="100%" stopColor="#0a4237" stopOpacity=".18" />
          </linearGradient>
          <filter id="diewishDarkProgressGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
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
          stroke="#39efbd"
          strokeWidth="5.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#diewishDarkProgressGlow)"
        />
        <g fill="#39efbd" filter="url(#diewishDarkProgressGlow)">
          <circle cx="83" cy="132" r="8" />
          <circle cx="140" cy="116" r="8" />
          <circle cx="197" cy="91" r="8" />
          <circle cx="254" cy="78" r="8" />
          <circle cx="311" cy="61" r="8" />
          <circle cx="368" cy="35" r="8" />
        </g>

        <g transform="translate(307 2)">
          <rect
            width="112"
            height="42"
            rx="17"
            fill="#0a392f"
            fillOpacity=".97"
            stroke="#1b6b58"
            strokeWidth="1.2"
          />
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

        <g fill="#126249" fillOpacity=".32">
          <ellipse cx="393" cy="165" rx="13" ry="38" transform="rotate(34 393 165)" />
          <ellipse cx="417" cy="179" rx="12" ry="34" transform="rotate(38 417 179)" />
        </g>
      </svg>
    </span>
  );
}

function DarkChevron({ tone }: { tone: Feature["tone"] }) {
  if (tone === "blood") {
    return (
      <span
        className="pointer-events-none absolute right-[1.35cqw] top-1/2 z-30 flex size-[5.35cqw] -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-[#edf5f2]"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[3.45cqw]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`pointer-events-none absolute right-[2.15cqw] top-1/2 z-30 -translate-y-1/2 bg-transparent ${
        tone === "scanner" ? "text-[#35e5b1]" : "text-[#d6e1de]"
      }`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[3.55cqw]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 5 7 7-7 7" />
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

  const layout =
    feature.tone === "scanner"
      ? {
          iconLeft: "2.35cqw",
          textLeft: "16.35cqw",
          titleSize: "3.35cqw",
          bodySize: "2.55cqw",
        }
      : feature.tone === "blood"
        ? {
            iconLeft: "2.45cqw",
            textLeft: "18.75cqw",
            titleSize: "3.65cqw",
            bodySize: "2.55cqw",
          }
        : {
            iconLeft: "2.35cqw",
            textLeft: "18.55cqw",
            titleSize: "3.72cqw",
            bodySize: "2.55cqw",
          };

  return (
    <Link
      href={feature.href}
      className="relative block w-full overflow-hidden rounded-[3.15cqw] border border-[#1b6b58]/80 bg-[#061917] shadow-[inset_0_0_4.6cqw_rgba(17,105,84,0.07),0_1.4cqw_4.2cqw_rgba(0,0,0,0.16)] [container-type:inline-size] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-inset"
      style={{ aspectRatio: feature.lightAspect }}
      aria-label={`${feature.title}. ${feature.description}`}
    >
      <span
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_78%_52%,rgba(19,103,82,0.15),transparent_38%),linear-gradient(104deg,#071b18_0%,#071c19_48%,#061715_100%)]"
        aria-hidden="true"
      />

      {feature.visual ? (
        <span
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 overflow-hidden ${
            feature.tone === "scanner" ? "w-[56.5%]" : "w-[50.5%]"
          }`}
          style={{
            WebkitMaskImage:
              feature.tone === "scanner"
                ? "linear-gradient(to right, transparent 0%, black 17%, black 100%)"
                : "linear-gradient(to right, transparent 0%, black 10%, black 100%)",
            maskImage:
              feature.tone === "scanner"
                ? "linear-gradient(to right, transparent 0%, black 17%, black 100%)"
                : "linear-gradient(to right, transparent 0%, black 10%, black 100%)",
          }}
          aria-hidden="true"
        >
          <Image
            src={feature.visual}
            alt=""
            fill
            unoptimized
            draggable={false}
            sizes="(max-width: 768px) 58vw, 580px"
            className={
              feature.tone === "scanner"
                ? "object-cover object-right saturate-[1.13] contrast-[1.05] brightness-[0.98]"
                : "object-cover object-right saturate-[0.98] contrast-[1.03] brightness-[0.83]"
            }
            aria-hidden="true"
          />
          <span
            className={
              feature.tone === "scanner"
                ? "absolute inset-0 bg-[linear-gradient(90deg,#061917_0%,rgba(6,25,23,0.68)_13%,rgba(6,25,23,0.08)_37%,transparent_66%)]"
                : "absolute inset-0 bg-[linear-gradient(90deg,#061917_0%,rgba(6,25,23,0.50)_10%,rgba(6,25,23,0.04)_34%,transparent_58%)]"
            }
          />
        </span>
      ) : (
        <DarkProgressArtwork />
      )}

      <span
        className="absolute top-1/2 z-20 -translate-y-1/2"
        style={{ left: layout.iconLeft }}
      >
        <DarkFeatureIcon tone={feature.tone} />
      </span>

      <span
        className="absolute top-1/2 z-20 min-w-0 -translate-y-1/2 text-left"
        style={{ left: layout.textLeft }}
      >
        <span
          className="block whitespace-nowrap font-extrabold leading-[1.03] tracking-[-0.035em] text-white"
          style={{ fontSize: layout.titleSize }}
        >
          {feature.title}
        </span>
        <span className="mt-[0.8cqw] block">
          {descriptionLines.map((line) => (
            <span
              key={line}
              className="block whitespace-nowrap font-normal leading-[1.22] tracking-[-0.012em] text-[#aeb9b6]"
              style={{ fontSize: layout.bodySize }}
            >
              {line}
            </span>
          ))}
        </span>
      </span>

      {isProgress ? (
        <span
          className="pointer-events-none absolute bottom-[-15%] left-[39%] z-[1] h-[72%] w-[38%] rounded-[50%] bg-emerald-900/10 blur-[0.45cqw]"
          aria-hidden="true"
        />
      ) : null}

      <DarkChevron tone={feature.tone} />
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
