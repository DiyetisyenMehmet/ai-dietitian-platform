"use client";

import * as React from "react";
import Link from "next/link";
import { Droplets, Footprints, Moon, Utensils, X } from "lucide-react";
import { toast } from "sonner";

import { activityStore } from "@/application/health/activity-store";
import { dailyTrackingStore } from "@/application/health/daily-tracking-store";
import { useWeightEntries, weightStore } from "@/application/health/weight-store";
import type { ActivityType } from "@/infrastructure/activity/activity-client";
import { sleepClient } from "@/infrastructure/sleep/sleep-client";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";

const tileClass =
  "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/70 px-1.5 py-2.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24 sm:gap-2 sm:px-2 sm:py-3";

type QuickAction = "water" | "activity" | "weight" | "sleep";
type WaterUnit = "ml" | "L";

const ACTIVITY_OPTIONS: Array<{ value: ActivityType; label: string }> = [
  { value: "WALKING", label: "Yürüyüş" },
  { value: "RUNNING", label: "Koşu" },
  { value: "CYCLING", label: "Bisiklet" },
  { value: "STRENGTH_TRAINING", label: "Kuvvet / ağırlık" },
  { value: "PILATES", label: "Pilates" },
  { value: "HOME_EXERCISE", label: "Ev egzersizi" },
  { value: "YOGA", label: "Yoga / esneme" },
  { value: "SPORTS", label: "Spor" },
  { value: "OTHER", label: "Diğer" },
];

function parseDecimal(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(3)));
}

function toLocalDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function defaultSleepTimes(): { start: string; wake: string } {
  const wake = new Date();
  wake.setSeconds(0, 0);
  const start = new Date(wake.getTime() - 8 * 60 * 60 * 1000);
  return { start: toLocalDateTimeInput(start), wake: toLocalDateTimeInput(wake) };
}

function WeightScaleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 text-violet-500 sm:size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="18" rx="4" />
      <rect x="8" y="6" width="8" height="5" rx="2" />
      <path d="M12 8.5 14 7" />
      <path d="M8 17h8" />
    </svg>
  );
}

function QuickModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation">
      <button type="button" aria-label="Pencereyi kapat" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-action-title"
        className="relative z-10 max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-2xl sm:rounded-[28px]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id="quick-action-title" className="text-xl font-bold tracking-tight">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

/** Five compact dashboard actions. The four lightweight records stay on the dashboard; meals keep the full, existing flow. */
export function DashboardQuickActions() {
  const weights = useWeightEntries();
  const latestWeight = weights.at(-1)?.weightKg;
  const historyPushed = React.useRef(false);
  const [active, setActive] = React.useState<QuickAction | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [waterValue, setWaterValue] = React.useState("250");
  const [waterUnit, setWaterUnit] = React.useState<WaterUnit>("ml");

  const [activityType, setActivityType] = React.useState<ActivityType>("WALKING");
  const [activityMinutes, setActivityMinutes] = React.useState("30");
  const [activityName, setActivityName] = React.useState("");

  const [weightValue, setWeightValue] = React.useState("");

  const sleepDefaults = React.useMemo(defaultSleepTimes, []);
  const [sleepStart, setSleepStart] = React.useState(sleepDefaults.start);
  const [wakeTime, setWakeTime] = React.useState(sleepDefaults.wake);
  const [sleepQuality, setSleepQuality] = React.useState("3");

  const openQuickAction = React.useCallback((action: QuickAction) => {
    if (typeof window !== "undefined") {
      window.history.pushState({ diewishQuickAction: action }, "", window.location.href);
      historyPushed.current = true;
    }
    setActive(action);
  }, []);

  const closeQuickAction = React.useCallback(() => {
    setActive(null);
    if (historyPushed.current && typeof window !== "undefined") {
      historyPushed.current = false;
      window.history.back();
    }
  }, []);

  React.useEffect(() => {
    if (!active) return;
    const onPopState = () => {
      historyPushed.current = false;
      setActive(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeQuickAction();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, closeQuickAction]);

  React.useEffect(() => {
    if (active === "weight") {
      setWeightValue(latestWeight ? String(latestWeight) : "");
    }
  }, [active, latestWeight]);

  const changeWaterUnit = (next: WaterUnit) => {
    if (next === waterUnit) return;
    const numeric = parseDecimal(waterValue);
    if (!Number.isFinite(numeric)) {
      setWaterUnit(next);
      return;
    }
    const milliliters = waterUnit === "ml" ? numeric : numeric * 1000;
    setWaterValue(formatDecimal(next === "ml" ? milliliters : milliliters / 1000));
    setWaterUnit(next);
  };

  const saveWater = async () => {
    if (saving) return;
    const numeric = parseDecimal(waterValue);
    const amountMl = waterUnit === "ml" ? numeric : numeric * 1000;
    if (!Number.isFinite(amountMl) || amountMl < 50 || amountMl > 10_000) {
      toast.error("Geçerli bir su miktarı gir", { description: "50 ml ile 10 L arasında bir değer seçebilirsin." });
      return;
    }
    const roundedMl = Math.round(amountMl);
    setSaving(true);
    try {
      await dailyTrackingStore.addWater(roundedMl);
      toast.success("Su kaydedildi", {
        description: roundedMl >= 1000 && roundedMl % 1000 === 0 ? `${roundedMl / 1000} L eklendi` : `${roundedMl} ml eklendi`,
      });
      closeQuickAction();
    } catch {
      toast.error("Su eklenemedi", { description: "Şu anda kayıt yapılamadı. Lütfen biraz sonra tekrar dene." });
    } finally {
      setSaving(false);
    }
  };

  const saveActivity = async () => {
    if (saving) return;
    const minutes = Number(activityMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      toast.error("Geçerli bir süre gir", { description: "Süre 1–1440 dakika arasında olmalı." });
      return;
    }
    setSaving(true);
    try {
      const activity = await activityStore.logActivity({
        type: activityType,
        durationMinutes: minutes,
        name: activityName.trim() || undefined,
        note: "Ana ekran hızlı işlem",
      });
      const label = activityName.trim() || ACTIVITY_OPTIONS.find((item) => item.value === activity.type)?.label || "Hareket";
      toast.success("Hareket kaydedildi", { description: `${label} · ${minutes} dk` });
      setActivityName("");
      closeQuickAction();
    } catch {
      toast.error("Hareket kaydedilemedi", { description: "Bağlantını kontrol edip tekrar deneyebilirsin." });
    } finally {
      setSaving(false);
    }
  };

  const saveWeight = async () => {
    if (saving) return;
    const kg = parseDecimal(weightValue);
    if (!Number.isFinite(kg) || kg <= 0 || kg > 400) {
      toast.error("Geçerli bir kilo gir", { description: "Örneğin 78,4 kg." });
      return;
    }
    const rounded = Number(kg.toFixed(1));
    setSaving(true);
    try {
      await weightStore.add(rounded);
      toast.success("Kilon kaydedildi", { description: `${rounded.toLocaleString("tr-TR")} kg` });
      closeQuickAction();
    } catch {
      toast.error("Kilo kaydedilemedi", { description: "Bağlantını kontrol edip tekrar deneyebilirsin." });
    } finally {
      setSaving(false);
    }
  };

  const saveSleep = async () => {
    if (saving) return;
    const start = new Date(sleepStart);
    const wake = new Date(wakeTime);
    const minutes = Math.round((wake.getTime() - start.getTime()) / 60_000);
    const quality = Number(sleepQuality);
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 1440) {
      toast.error("Uyku saatlerini kontrol et", { description: "Uyku süresi 15 dakika ile 24 saat arasında olmalı." });
      return;
    }
    if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
      toast.error("Uyku kalitesini 1–5 arasında seç.");
      return;
    }
    setSaving(true);
    try {
      await sleepClient.create({ sleepStart: start.toISOString(), wakeTime: wake.toISOString(), quality });
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      toast.success("Uyku kaydedildi", { description: `${hours} sa${rest ? ` ${rest} dk` : ""} · kalite ${quality}/5` });
      closeQuickAction();
    } catch {
      toast.error("Uyku kaydedilemedi", { description: "Bilgileri kontrol edip tekrar deneyebilirsin." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="dashboard-quick-actions-heading">
      <h2 id="dashboard-quick-actions-heading" className="text-lg font-bold sm:text-xl">Bugün için hızlı işlemler</h2>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        <Link href="/meals/add?returnTo=%2Fdashboard" className={`${tileClass} bg-emerald-500/[0.06]`}>
          <Utensils className="size-6 text-emerald-500 sm:size-7" aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-tight sm:text-sm">Öğün Ekle</span>
        </Link>
        <button type="button" onClick={() => openQuickAction("water")} className={`${tileClass} bg-sky-500/[0.06]`}>
          <Droplets className="size-6 text-sky-500 sm:size-7" aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-tight sm:text-sm">Su Ekle</span>
        </button>
        <button type="button" onClick={() => openQuickAction("activity")} className={`${tileClass} bg-teal-500/[0.06]`}>
          <Footprints className="size-6 text-teal-500 sm:size-7" aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-tight sm:text-sm">Hareket</span>
        </button>
        <button type="button" onClick={() => openQuickAction("weight")} className={`${tileClass} bg-violet-500/[0.06]`}>
          <WeightScaleIcon />
          <span className="text-[10px] font-semibold leading-tight sm:text-sm">Kilo Ekle</span>
        </button>
        <button type="button" onClick={() => openQuickAction("sleep")} className={`${tileClass} bg-indigo-500/[0.06]`}>
          <Moon className="size-6 text-indigo-500 sm:size-7" aria-hidden="true" />
          <span className="text-[10px] font-semibold leading-tight sm:text-sm">Uyku Ekle</span>
        </button>
      </div>

      {active === "water" && (
        <QuickModal title="Su ekle" subtitle="Bardakla hızlı seç veya kendi miktarını gir." onClose={closeQuickAction}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "1 Bardak", detail: "250 ml", value: "250", unit: "ml" as const },
              { label: "2 Bardak", detail: "500 ml", value: "500", unit: "ml" as const },
              { label: "3 Bardak", detail: "750 ml", value: "750", unit: "ml" as const },
              { label: "1 Litre", detail: "1000 ml", value: "1", unit: "L" as const },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => { setWaterValue(option.value); setWaterUnit(option.unit); }}
                className="rounded-2xl border border-border bg-card px-3 py-3 text-left transition hover:border-sky-500/40 hover:bg-sky-500/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.detail}</span>
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label htmlFor="quick-water-amount" className="mb-1.5 block text-sm font-medium">Özel miktar</label>
            <div className="flex gap-2">
              <Input
                id="quick-water-amount"
                inputMode="decimal"
                value={waterValue}
                onChange={(event) => setWaterValue(event.target.value)}
                aria-label="Su miktarı"
              />
              <select
                aria-label="Su birimi"
                value={waterUnit}
                onChange={(event) => changeWaterUnit(event.target.value as WaterUnit)}
                className="h-11 min-w-20 rounded-xl border border-input bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ml">ml</option>
                <option value="L">Litre</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Birim değiştirildiğinde miktar otomatik dönüştürülür. Örn. 1000 ml = 1 L.</p>
          </div>

          <Button className="mt-5 w-full" isLoading={saving} onClick={() => void saveWater()}>
            {waterUnit === "L" ? `${waterValue || "0"} L su ekle` : `${waterValue || "0"} ml su ekle`}
          </Button>
        </QuickModal>
      )}

      {active === "activity" && (
        <QuickModal title="Hareket ekle" subtitle="Türünü ve süresini seç; kaydın hareket özetine anında işlensin." onClose={closeQuickAction}>
          <label className="block text-sm font-medium">
            Hareket türü
            <select
              value={activityType}
              onChange={(event) => setActivityType(event.target.value as ActivityType)}
              className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ACTIVITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium">
            Süre, dakika
            <Input className="mt-1.5" inputMode="numeric" type="number" min={1} max={1440} value={activityMinutes} onChange={(event) => setActivityMinutes(event.target.value)} />
          </label>
          <label className="mt-4 block text-sm font-medium">
            Not / hareket adı <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
            <Input className="mt-1.5" maxLength={120} placeholder="Örn. tempolu yürüyüş" value={activityName} onChange={(event) => setActivityName(event.target.value)} />
          </label>
          <Button className="mt-5 w-full" isLoading={saving} onClick={() => void saveActivity()}>Hareketi kaydet</Button>
        </QuickModal>
      )}

      {active === "weight" && (
        <QuickModal title="Kilo ekle" subtitle={latestWeight ? `Son kaydın ${latestWeight.toLocaleString("tr-TR")} kg. Yeni ölçümünü gir.` : "Güncel kilonu hızlıca kaydet."} onClose={closeQuickAction}>
          <label htmlFor="quick-weight" className="block text-sm font-medium">Bugünkü kilon (kg)</label>
          <Input id="quick-weight" className="mt-1.5" inputMode="decimal" placeholder="78,4" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} />
          <Button className="mt-5 w-full" isLoading={saving} onClick={() => void saveWeight()}>Kiloyu kaydet</Button>
        </QuickModal>
      )}

      {active === "sleep" && (
        <QuickModal title="Uyku ekle" subtitle="Başlangıç, uyanma ve kalite bilgisiyle kısa bir uyku kaydı oluştur." onClose={closeQuickAction}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Uyku başlangıcı<Input className="mt-1.5" type="datetime-local" value={sleepStart} onChange={(event) => setSleepStart(event.target.value)} /></label>
            <label className="text-sm font-medium">Uyanma saati<Input className="mt-1.5" type="datetime-local" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} /></label>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Uyku kalitesi
            <select
              value={sleepQuality}
              onChange={(event) => setSleepQuality(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="1">1 — Çok kötü</option>
              <option value="2">2 — Kötü</option>
              <option value="3">3 — Orta</option>
              <option value="4">4 — İyi</option>
              <option value="5">5 — Çok iyi</option>
            </select>
          </label>
          <Button className="mt-5 w-full" isLoading={saving} onClick={() => void saveSleep()}>Uyku kaydını ekle</Button>
        </QuickModal>
      )}
    </section>
  );
}