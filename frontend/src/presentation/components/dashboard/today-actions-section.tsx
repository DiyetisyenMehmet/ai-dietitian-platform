"use client";

import Link from "next/link";
import { Footprints, Plus, Utensils } from "lucide-react";

import { Card, CardContent } from "@/presentation/components/ui/card";

/** The dashboard's compact action launcher for meal and movement entry. */
export function TodayActionsSection() {
  return (
    <section className="space-y-3" aria-labelledby="today-actions-heading">
      <div>
        <h2 id="today-actions-heading" className="text-lg font-bold">
          Bugün için küçük adımlar
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Takibini kolay tut. İhtiyacın olan yerden başla.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/meals/add" className="group block">
          <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
            <CardContent className="flex items-center gap-3 p-4 lg:flex-col lg:items-start">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Utensils className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Öğününü kaydet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Ne yediğini ekle</p>
              </div>
              <Plus className="ml-auto size-4 text-muted-foreground lg:hidden" aria-hidden="true" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/activity" className="group block">
          <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/[0.03]">
            <CardContent className="flex items-center gap-3 p-4 lg:flex-col lg:items-start">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Footprints className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Hareketini kaydet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Yürüyüş veya egzersiz ekle</p>
              </div>
              <Plus className="ml-auto size-4 text-muted-foreground lg:hidden" aria-hidden="true" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </section>
  );
}
