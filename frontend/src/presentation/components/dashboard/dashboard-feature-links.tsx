import Image from "next/image";
import Link from "next/link";

const REFERENCE_WIDTH = 1536;
const REFERENCE_HEIGHT = 1054;

// Card bounds in the approved artwork. Percentages keep the hit areas aligned
// with the unmodified image at every container width, including mobile WebViews.
const FEATURES = [
  {
    title: "Besin ve Barkod Tarayıcı",
    description: "Yemeğini fotoğrafla veya paketli ürünü barkodla tara.",
    href: "/meals/scan",
    top: 21,
    height: 312,
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    top: 361,
    height: 348,
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    top: 740,
    height: 298,
  },
] as const;

/** Approved reference artwork with three independent, accessible route links. */
export function DashboardFeatureLinks() {
  return (
    <section
      id="diewish-tools"
      className="relative isolate w-full"
      aria-label="Diewish araçları"
    >
      {/* Preserve the supplied pixels, typography, gradients and proportions.
          Numbers in the artwork are illustrative, never personal health data. */}
      <Image
        src="/images/dashboard/feature-cards-reference.jpg"
        alt=""
        width={REFERENCE_WIDTH}
        height={REFERENCE_HEIGHT}
        unoptimized
        draggable={false}
        className="pointer-events-none block h-auto w-full select-none"
      />
      {FEATURES.map((feature) => (
        <Link
          key={feature.href}
          href={feature.href}
          className="absolute block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          style={{
            left: `${(54 / REFERENCE_WIDTH) * 100}%`,
            width: `${(1430 / REFERENCE_WIDTH) * 100}%`,
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
    </section>
  );
}
