import Link from "next/link";
import { ChevronRight, FlaskConical, ScanLine, TrendingUp, type LucideIcon } from "lucide-react";

interface FeatureLink {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  iconWrap: string;
  iconColor: string;
  imageUrl: string;
  imageAlt: string;
}

const FEATURES: FeatureLink[] = [
  {
    title: "Besin ve Barkod Tarayıcı",
    description: "Yemeğini fotoğrafla veya paketli ürünü barkodla tara.",
    href: "/meals/scan",
    icon: ScanLine,
    iconWrap: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=480&q=82",
    imageAlt: "Besin tarama için renkli ve dengeli bir yemek",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    icon: FlaskConical,
    iconWrap: "bg-rose-500/10",
    iconColor: "text-rose-500",
    imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=480&q=82",
    imageAlt: "Laboratuvar ortamında kan örneği analizi",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    icon: TrendingUp,
    iconWrap: "bg-teal-500/10",
    iconColor: "text-teal-500",
    imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=480&q=82",
    imageAlt: "İlerleme ve analiz grafikleri",
  },
];

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

            <span className="relative h-20 w-[88px] shrink-0 overflow-hidden rounded-2xl border border-border/50 bg-muted sm:w-28">
              <img
                src={feature.imageUrl}
                alt={feature.imageAlt}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" aria-hidden="true" />
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
