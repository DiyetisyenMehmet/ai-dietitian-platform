import Link from "next/link";
import { ChevronRight, FlaskConical, ScanBarcode, ScanLine, TrendingUp, type LucideIcon } from "lucide-react";

interface FeatureLink {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  iconWrap: string;
  iconColor: string;
  preview: string;
}

const FEATURES: FeatureLink[] = [
  {
    title: "Besin Tarayıcı",
    description: "Yemeğini fotoğrafla tara ve besin değerlerini öğren.",
    href: "/meals/scan",
    icon: ScanLine,
    iconWrap: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    preview: "from-emerald-500/5 to-teal-500/15",
  },
  {
    title: "Barkod Tara",
    description: "Paketli ürünlerin besin değerlerini görüntüle.",
    href: "/meals/scan?mode=barcode",
    icon: ScanBarcode,
    iconWrap: "bg-slate-500/10",
    iconColor: "text-slate-500 dark:text-slate-300",
    preview: "from-slate-500/5 to-slate-500/15",
  },
  {
    title: "Kan Tahlili Analizi",
    description: "Tahlil sonuçlarını yükle, anlaşılır şekilde değerlendir.",
    href: "/profile/blood-tests",
    icon: FlaskConical,
    iconWrap: "bg-rose-500/10",
    iconColor: "text-rose-500",
    preview: "from-rose-500/5 to-orange-500/10",
  },
  {
    title: "İlerlememi Gör",
    description: "Kilo, beslenme, su ve hareket verilerini incele.",
    href: "/progress",
    icon: TrendingUp,
    iconWrap: "bg-teal-500/10",
    iconColor: "text-teal-500",
    preview: "from-teal-500/5 to-emerald-500/15",
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

            <span className={`hidden h-20 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br sm:flex ${feature.preview}`} aria-hidden="true">
              <Icon className={`size-10 opacity-70 ${feature.iconColor}`} />
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Link>
        );
      })}
    </section>
  );
}
