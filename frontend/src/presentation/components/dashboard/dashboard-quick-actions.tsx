"use client";

import * as React from "react";
import Link from "next/link";
import { EyeOff, GripVertical, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { activityStore } from "@/application/health/activity-store";
import { dailyTrackingStore } from "@/application/health/daily-tracking-store";
import { useWeightEntries, weightStore } from "@/application/health/weight-store";
import type { ActivityType } from "@/infrastructure/activity/activity-client";
import { sleepClient } from "@/infrastructure/sleep/sleep-client";
import type { DashboardQuickActionId } from "@/domain/account/dashboard-card-preferences";
import {
  DashboardQuickActionIcon,
  dashboardQuickActionMeta,
} from "@/presentation/components/dashboard/dashboard-quick-action-registry";
import { useDashboardInlineReorder } from "@/presentation/components/dashboard/use-dashboard-inline-reorder";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { cn } from "@/shared/lib/utils";

const tileClass =
  "flex min-h-20 w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/70 px-1.5 py-2.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24 sm:gap-2 sm:px-2 sm:py-3";

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

/** Equal-width dashboard actions. The visible count can safely vary from 2 to 5. */
export interface DashboardQuickActionsProps {
  editing?: boolean;
  visibleActionIds?: DashboardQuickActionId[];
  savingPreferences?: boolean;
  onToggleEditing?: () => void;
  onHideAction?: (id: DashboardQuickActionId) => void;
  onOrderPreview?: (ids: DashboardQuickActionId[]) => void;
  onOrderCommit?: (ids: DashboardQuickActionId[]) => void | Promise<unknown>;
}

export function DashboardQuickActions({
  editing = false,
  visibleActionIds = ["meal", "water", "activity", "weight"],
  savingPreferences = false,
  onToggleEditing,
  onHideAction,
  onOrderPreview = () => undefined,
  onOrderCommit = () => undefined,
}: DashboardQuickActionsProps = {}) {
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

  const quickReorder = useDashboardInlineReorder<DashboardQuickActionId>({
    group: "quick-actions",
    axis: "x",
    ids: visibleActionIds,
    disabled: savingPreferences || !editing,
    onPreview: onOrderPreview,
    onCommit: onOrderCommit,
  });

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
    <section
      className="space-y-3"
      aria-labelledby="dashboard-quick-actions-heading"
      data-dashboard-quick-actions
      data-dashboard-edit-mode={editing ? "true" : "false"}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2
          id="dashboard-quick-actions-heading"
          className="min-w-0 text-[22px] font-bold sm:text-2xl"
        >
          Bugün için hızlı işlemler
        </h2>
        {onToggleEditing && (
          <button
            type="button"
            aria-label={editing ? "Ana ekran düzenlemeyi kapat" : "Ana ekranı düzenle"}
            aria-pressed={editing}
            onClick={onToggleEditing}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-sm transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              editing && "border-primary/30 bg-primary/10 text-primary",
            )}
            data-dashboard-edit-toggle
          >
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className={cn(
          "flex min-w-0",
          visibleActionIds.length >= 5 ? "gap-1" : "gap-1.5 sm:gap-3",
        )}
        data-quick-action-layout="equal-flex"
        data-max-actions="5"
        data-visible-actions={visibleActionIds.length}
      >
        {visibleActionIds.map((id) => {
          const meta = dashboardQuickActionMeta(id);
          const tileContent = (
            <>
              <DashboardQuickActionIcon id={id} />
              <span className="whitespace-nowrap text-[12px] font-semibold leading-tight sm:text-base">
                {meta.label}
              </span>
            </>
          );

          return (
            <div
              key={id}
              className={cn(
                "relative min-w-0 flex-1 basis-0 transition-[transform,filter] duration-150",
                quickReorder.draggingId === id && "z-20 scale-[1.02] drop-shadow-lg",
              )}
              data-quick-action-slot={id}
              data-personalize-group="quick-actions"
              data-personalize-item={id}
            >
              {id === "meal" ? (
                <Link
                  href="/meals/add?returnTo=%2Fdashboard"
                  tabIndex={editing ? -1 : undefined}
                  aria-disabled={editing || undefined}
                  onClick={
                    editing
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      : undefined
                  }
                  className={cn(tileClass, meta.tileClass)}
                >
                  {tileContent}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={editing}
                  onClick={() => openQuickAction(id)}
                  className={cn(tileClass, meta.tileClass, "disabled:opacity-100")}
                >
                  {tileContent}
                </button>
              )}

              {editing && (
                <>
                  <button
                    type="button"
                    aria-label={`${meta.label} hızlı işlemini sürükle. Sol ve sağ ok tuşlarıyla sırala.`}
                    aria-grabbed={quickReorder.draggingId === id}
                    disabled={savingPreferences}
                    onPointerDown={(event) => quickReorder.onPointerDown(event, id)}
                    onKeyDown={(event) => quickReorder.onKeyDown(event, id)}
                    className="absolute -left-1 -top-2 z-30 flex size-10 touch-none items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    data-quick-action-drag-handle={id}
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${meta.label} hızlı işlemini gizle`}
                    disabled={savingPreferences}
                    onClick={() => onHideAction?.(id)}
                    className="absolute -right-1 -top-2 z-30 flex size-10 items-center justify-center rounded-full border border-border/80 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    data-quick-action-hide={id}
                  >
                    <EyeOff className="size-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          );
        })}
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