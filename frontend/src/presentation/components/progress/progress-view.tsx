"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { formatLongDate } from "@/shared/lib/format";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { EmptyState } from "@/presentation/components/feedback/empty-state";
import { SectionCard } from "@/presentation/components/health/section-card";
import { ProgressStatsSection } from "@/presentation/components/progress/progress-stats-section";
import { ProgressHomeOverview } from "@/presentation/components/progress/progress-home-overview";
import { healthIcon } from "@/presentation/components/health/health-icon";
import { useWeightCheckInStatus, weightStore } from "@/application/health/weight-store";
import { formatWeightNumber, localDateKey, parseWeightInput } from "@/application/health/weight-utils";
import { journeyStore, useJourneyEvents } from "@/application/health/journey-store";
import type { JourneyEventType } from "@/domain/health/types";

const HISTORY_ICON: Record<JourneyEventType, Parameters<typeof healthIcon>[0]> = {
  "profile-created": "user",
  "blood-test": "flask",
  "first-plan": "sparkles",
  "weight-updated": "scale",
  "goal-reached": "trophy",
  streak: "flame",
  "goal-updated": "flag",
  "meal-added": "utensils",
  "nutrition-adapted": "sparkles",
  review: "calendar",
  achievement: "star",
};

function WeighInForm() {
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(() => localDateKey());
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const kg = parseWeightInput(value);
    if (kg === null) {
      toast.error("Geçerli bir kilo gir", { description: "25-400 kg arasında, en fazla 1 ondalık kullan." });
      return;
    }
    if (!date || date > localDateKey()) {
      toast.error("Geçerli bir ölçüm tarihi seç");
      return;
    }

    setSaving(true);
    try {
      const result = await weightStore.add(kg, undefined, date);
      await journeyStore.hydrateJourneyFromBackend();
      if (result.profileSynced) {
        toast.success("Kilon kaydedildi", {
          description: `${formatWeightNumber(kg)} kg`,
        });
      } else {
        toast.warning("Kilon kaydedildi", {
          description: "Güncel kilo özeti şu anda yenilenemedi; kayıt geçmişinde korundu.",
        });
      }
      setValue("");
      setDate(localDateKey());
    } catch {
      toast.error("Kilo kaydedilemedi", {
        description: "Bağlantını kontrol edip tekrar deneyebilirsin. Girdiğin değer korunuyor.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 sm:flex sm:items-end sm:gap-3 sm:space-y-0">
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="weigh-in" className="mb-1.5 block text-xs text-muted-foreground">
            Kilo (kg)
          </label>
          <Input
            id="weigh-in"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="78,4"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={saving}
            aria-describedby="weigh-in-help"
          />
          <span id="weigh-in-help" className="sr-only">
            25 ile 400 kilogram arasında, en fazla bir ondalık basamak girin.
          </span>
        </div>
        <div>
          <label htmlFor="weigh-in-date" className="mb-1.5 block text-xs text-muted-foreground">
            Ölçüm tarihi
          </label>
          <Input
            id="weigh-in-date"
            type="date"
            max={localDateKey()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={saving}
          />
        </div>
      </div>
      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        <Plus className="size-4" aria-hidden="true" />
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}

export function ProgressView() {
  const checkIn = useWeightCheckInStatus();
  const history = useJourneyEvents();

  React.useEffect(() => {
    void weightStore.hydrateCheckInFromBackend();
  }, []);

  return (
    <div className="space-y-5">
      <ProgressHomeOverview />

      <SectionCard icon="scale" title="Kilonu Kaydet">
        {checkIn?.required && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Haftalık kilo check-inin bekliyor
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Beslenme hedeflerinin eski kiloya göre yeniden hesaplanmaması için yeni plan oluşturma, yenileme ve uzatma işlemlerinden önce güncel kilonu kaydetmen gerekiyor. Mevcut planın ve geçmiş kayıtların erişilebilir kalır.
            </p>
          </div>
        )}
        {!checkIn?.required && checkIn?.active && checkIn.nextDueAt && (
          <p className="mb-3 text-xs text-muted-foreground">
            Sonraki haftalık check-in: {formatLongDate(new Date(checkIn.nextDueAt))}
          </p>
        )}
        <WeighInForm />
      </SectionCard>

      <ProgressStatsSection />

      <SectionCard
        icon="calendar"
        title="Geçmiş"
        action={
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/history">Tüm geçmişimi gör</Link>
          </Button>
        }
      >
        {history.length === 0 ? (
          <EmptyState
            icon={healthIcon("calendar")}
            title="Henüz geçmiş kaydın yok"
            description="Kilo, öğün ve diğer ilerleme kayıtların zamanla burada görünecek."
          />
        ) : (
          <ol className="relative space-y-5 pl-8">
            <span className="absolute bottom-1.5 left-[13px] top-1.5 w-px bg-border" aria-hidden="true" />
            {history.map((event) => {
              const Icon = healthIcon(HISTORY_ICON[event.type]);
              return (
                <li key={event.id} className="relative">
                  <span className="absolute -left-8 flex size-7 items-center justify-center rounded-full border border-border bg-card text-primary">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium leading-tight">{event.title}</p>
                  {event.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatLongDate(new Date(event.date))}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
