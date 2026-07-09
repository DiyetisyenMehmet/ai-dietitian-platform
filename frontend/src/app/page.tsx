import type { Metadata } from "next";
import { Leaf, ShieldCheck, Layers } from "lucide-react";

import { APP_CONFIG } from "@/shared/constants/app";
import { AppShell } from "@/presentation/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardTitle } from "@/presentation/components/ui/card";

export const metadata: Metadata = {
  title: "Ana Sayfa",
};

const FOUNDATION_HIGHLIGHTS = [
  {
    icon: Layers,
    title: "Modüler Mimari",
    description: "Domain odaklı, katmanlı ve ölçeklenebilir frontend temeli.",
  },
  {
    icon: ShieldCheck,
    title: "Güvenli Tasarım",
    description: "Security & Privacy by Design ilkeleriyle inşa edilir.",
  },
  {
    icon: Leaf,
    title: "Premium Deneyim",
    description: "Mobil öncelikli, erişilebilir ve akıcı arayüz temeli.",
  },
] as const;

export default function HomePage() {
  return (
    <AppShell title={APP_CONFIG.name}>
      <div className="animate-fade-in space-y-6">
        <section className="space-y-2">
          <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Sprint 1 · Frontend Foundation
          </span>
          <h2 className="text-2xl font-bold tracking-tight">{APP_CONFIG.name}</h2>
          <p className="text-sm text-muted-foreground">{APP_CONFIG.description}</p>
        </section>

        <section className="grid gap-3">
          {FOUNDATION_HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="transition-shadow hover:shadow-card-hover">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}
