"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronRight,
  Copy,
  Droplets,
  Info,
  PauseCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { NotificationPreferences } from "@/domain/account/types";
import {
  MAX_WATER_TIMES_PER_DAY,
  WEEK_DAYS,
  cloneWaterPlan,
  copyWaterDay,
  isWaterReminderSchedule,
  waterPlanSummary,
  waterReminderPlan,
  type WaterReminderDay,
  type WaterReminderSchedule,
} from "@/domain/account/water-reminder-plan";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import { syncWellnessReminderSchedule } from "@/infrastructure/notifications/native-wellness";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from "@/presentation/components/ui/modal";
import { PreferenceSwitch } from "./notification-preference-category";
import { WaterReminderTimes } from "./water-reminder-times";

type Operation =
  | { kind: "copy"; title: string; source: WaterReminderDay; targets: number[] }
  | { kind: "clear-day"; source: WaterReminderDay }
  | { kind: "clear-all" };
const dayLabel = (day: number) => WEEK_DAYS.find((entry) => entry.day === day)?.label ?? "Gün";

export function WaterRemindersView() {
  const [preferences, setPreferences] = React.useState<NotificationPreferences | null>(null);
  const [draft, setDraft] = React.useState<WaterReminderSchedule | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const saveLock = React.useRef(false);
  const [selectedDay, setSelectedDay] = React.useState(1);
  const [editor, setEditor] = React.useState<WaterReminderDay | null>(null);
  const [operation, setOperation] = React.useState<Operation | null>(null);
  const [targets, setTargets] = React.useState<number[]>([]);
  const [includeClosed, setIncludeClosed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void notificationClient
      .getPreferences()
      .then(async ({ preferences: loaded }) => {
        const offset = new Date().getTimezoneOffset();
        const next =
          loaded.timezoneOffsetMinutes === offset
            ? loaded
            : (await notificationClient.updatePreferences({ timezoneOffsetMinutes: offset }))
                .preferences;
        if (cancelled) return;
        setPreferences(next);
        setDraft(waterReminderPlan(next.waterReminderSchedule, next.waterReminderTime));
        setEnabled(next.waterReminders);
        syncWellnessReminderSchedule(next);
      })
      .catch(() => {
        if (!cancelled)
          setLoadError(
            "Su hatırlatmaları yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const updateDraft = (next: WaterReminderSchedule) => {
    setDraft(cloneWaterPlan(next));
    setSaved(false);
    setSaveError(null);
  };
  const updateDay = (day: WaterReminderDay) => {
    if (draft)
      updateDraft({
        ...draft,
        days: draft.days.map((entry) => (entry.day === day.day ? day : entry)),
      });
  };
  const openEditor = (day: number) => {
    if (!draft || saving) return;
    const entry = draft.days.find((entry) => entry.day === day);
    if (entry) {
      setSelectedDay(day);
      setEditor({ ...entry, times: [...entry.times] });
    }
  };
  const openOperation = (next: Operation) => {
    setOperation(next);
    setIncludeClosed(false);
    setTargets(
      next.kind === "copy"
        ? next.targets.filter((day) => draft?.days.find((entry) => entry.day === day)?.enabled)
        : [],
    );
  };
  const applyOperation = () => {
    if (!draft || !operation) return;
    if (operation.kind === "copy") {
      const withSource = {
        ...draft,
        days: draft.days.map((day) => (day.day === operation.source.day ? operation.source : day)),
      };
      updateDraft(copyWaterDay(withSource, operation.source.day, targets, includeClosed));
    } else if (operation.kind === "clear-day") updateDay({ ...operation.source, times: [] });
    else
      updateDraft({
        ...draft,
        dailyTimes: [],
        days: draft.days.map((day) => ({ ...day, times: [] })),
      });
    setOperation(null);
    setEditor(null);
  };

  const save = async () => {
    if (!draft || !preferences || saveLock.current || !isWaterReminderSchedule(draft)) return;
    saveLock.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const plan = cloneWaterPlan(draft);
    try {
      const firstTime =
        plan.mode === "same"
          ? plan.dailyTimes[0]
          : plan.days.find((day) => day.enabled && day.times.length)?.times[0];
      const { preferences: next } = await notificationClient.updatePreferences({
        waterReminders: enabled,
        waterReminderSchedule: plan,
        waterReminderTime: firstTime ?? preferences.waterReminderTime,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      });
      if (
        !isWaterReminderSchedule(next.waterReminderSchedule) ||
        JSON.stringify(cloneWaterPlan(next.waterReminderSchedule)) !== JSON.stringify(plan) ||
        next.waterReminders !== enabled
      )
        throw new Error("Water schedule was not persisted");
      setPreferences(next);
      setDraft(cloneWaterPlan(next.waterReminderSchedule));
      setEnabled(next.waterReminders);
      setSaved(true);
      syncWellnessReminderSchedule(next);
      toast.success("Su hatırlatmaların kaydedildi");
    } catch {
      setDraft(waterReminderPlan(preferences.waterReminderSchedule, preferences.waterReminderTime));
      setEnabled(preferences.waterReminders);
      setSaveError(
        "Plan kaydedilemedi. Son kayıtlı ayarların geri yüklendi; tekrar deneyebilirsin.",
      );
      toast.error("Su hatırlatmaları kaydedilemedi.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <p className="text-sm text-muted-foreground">Su hatırlatmaları yükleniyor…</p>
        <div
          aria-hidden="true"
          className="h-64 animate-pulse rounded-2xl bg-muted/50 motion-reduce:animate-none"
        />
      </div>
    );
  if (!draft || !preferences)
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <p role="alert" className="text-sm text-destructive">
            {loadError ?? "Su hatırlatmaları şu anda kullanılamıyor."}
          </p>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Tekrar dene
          </Button>
        </CardContent>
      </Card>
    );
  const baseline = waterReminderPlan(
    preferences.waterReminderSchedule,
    preferences.waterReminderTime,
  );
  const dirty =
    enabled !== preferences.waterReminders ||
    JSON.stringify(cloneWaterPlan(draft)) !== JSON.stringify(baseline);
  const selected = draft.days.find((day) => day.day === selectedDay)!;
  const copy = (source: WaterReminderDay, title: string, days: number[]) =>
    openOperation({
      kind: "copy",
      title,
      source: { ...source, times: [...source.times] },
      targets: days.filter((day) => day !== source.day),
    });
  const copyTargets =
    operation?.kind === "copy"
      ? WEEK_DAYS.filter(({ day }) => operation.targets.includes(day))
      : [];

  return (
    <div className="space-y-4" data-water-reminders data-saving={saving}>
      <div className="flex items-start gap-3 rounded-2xl bg-primary/5 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Droplets className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Su hatırlatmaları</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Gün içinde su hedefine ulaşman için nazikçe hatırlatalım.
          </p>
        </div>
        <PreferenceSwitch
          label="Su hatırlatmaları"
          enabled={enabled}
          busy={saving}
          onToggle={() => {
            setEnabled(!enabled);
            setSaved(false);
            setSaveError(null);
          }}
        />
      </div>
      {!enabled && (
        <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Hatırlatmalar kapalı. Programını düzenleyebilirsin; kaydedilen saatler korunur.
        </p>
      )}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            Hatırlatma programı
          </div>
          <div
            className="flex gap-1 rounded-xl bg-muted p-1"
            role="group"
            aria-label="Hatırlatma modu"
          >
            {(["same", "custom"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={draft.mode === mode}
                disabled={saving}
                className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 py-2 text-xs font-medium leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${draft.mode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
                onClick={() => updateDraft({ ...draft, mode })}
              >
                {mode === "same" ? "Her gün aynı" : "Günlere göre özelleştir"}
              </button>
            ))}
          </div>
          {draft.mode === "same" ? (
            <WaterReminderTimes
              label="Her gün"
              times={draft.dailyTimes}
              disabled={saving}
              onChange={(dailyTimes) => {
                const inherited = draft.days.every(
                  (day) =>
                    day.enabled && JSON.stringify(day.times) === JSON.stringify(draft.dailyTimes),
                );
                updateDraft({
                  ...draft,
                  dailyTimes,
                  days: inherited
                    ? draft.days.map((day) => ({ ...day, times: [...dailyTimes] }))
                    : draft.days,
                });
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1" aria-label="Haftanın günleri">
                {WEEK_DAYS.map(({ day, label, short }) => (
                  <button
                    type="button"
                    key={day}
                    aria-label={`${label} hızlı düzenle`}
                    aria-pressed={selectedDay === day}
                    disabled={saving}
                    className={`min-h-11 rounded-xl text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedDay === day ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    onClick={() => openEditor(day)}
                  >
                    {short}
                  </button>
                ))}
              </div>
              <div
                className="divide-y divide-border rounded-2xl border border-border"
                aria-label="Haftalık su planı"
              >
                {WEEK_DAYS.map(({ day, label }) => {
                  const entry = draft.days.find((entry) => entry.day === day)!;
                  return (
                    <div key={day} className="flex items-center gap-2 p-3" data-water-day={day}>
                      <button
                        type="button"
                        aria-label={`${label} planını düzenle`}
                        disabled={saving}
                        className="min-h-11 min-w-0 flex-1 space-y-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => openEditor(day)}
                      >
                        <p className="text-xs font-semibold">{label}</p>
                        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                          {!entry.enabled ? (
                            <span>Kapalı</span>
                          ) : entry.times.length ? (
                            entry.times.map((time) => (
                              <span
                                key={time}
                                className="rounded-full bg-muted px-2 py-1 tabular-nums"
                              >
                                {time}
                              </span>
                            ))
                          ) : (
                            <span>Saat eklenmedi</span>
                          )}
                        </div>
                      </button>
                      <PreferenceSwitch
                        label={`${label} hatırlatmaları`}
                        enabled={entry.enabled}
                        busy={saving}
                        onToggle={() => updateDay({ ...entry, enabled: !entry.enabled })}
                      />
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold">{dayLabel(selectedDay)} için hızlı işlemler</p>
                <QuickAction
                  label="Diğer günlere kopyala"
                  disabled={saving || !selected.times.length}
                  onClick={() =>
                    copy(
                      selected,
                      `${dayLabel(selectedDay)} planını kopyala`,
                      WEEK_DAYS.map(({ day }) => day),
                    )
                  }
                />
                <QuickAction
                  label="Hafta içine uygula"
                  disabled={saving || !selected.times.length}
                  onClick={() => copy(selected, "Hafta içine uygula", [1, 2, 3, 4, 5])}
                />
                <QuickAction
                  label="Hafta sonuna uygula"
                  disabled={saving || !selected.times.length}
                  onClick={() => copy(selected, "Hafta sonuna uygula", [6, 0])}
                />
              </div>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            disabled={
              saving || (!draft.dailyTimes.length && draft.days.every((day) => !day.times.length))
            }
            onClick={() => openOperation({ kind: "clear-all" })}
          >
            <Trash2 aria-hidden="true" />
            Tüm saatleri temizle
          </Button>
        </CardContent>
      </Card>
      <div className="flex items-start gap-2 rounded-2xl bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Gün başına en fazla {MAX_WATER_TIMES_PER_DAY} hatırlatma ekleyebilirsin. Programın Diewish
          hesabında saklanır. Bildirim alabilmek için kullandığın platformda bildirim izninin ve
          bildirim bağlantısının açık olması gerekir.
        </p>
      </div>
      {saveError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
        >
          {saveError}
        </p>
      )}
      <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm">
        <p className="text-xs text-muted-foreground">{waterPlanSummary(draft)}</p>
        <Button
          type="button"
          className="w-full"
          isLoading={saving}
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          Kaydet
        </Button>
        <p
          role="status"
          aria-live="polite"
          className="min-h-4 text-center text-xs text-muted-foreground"
        >
          {saving
            ? "Kaydediliyor…"
            : saved
              ? "✓ Kaydedildi"
              : dirty
                ? "Değişikliklerin henüz kaydedilmedi."
                : "Tercihlerin Diewish hesabında saklanır."}
        </p>
      </div>
      <Modal
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <ModalContent variant="sheet" data-water-day-sheet>
          <div
            aria-hidden="true"
            className="mx-auto -mt-1 h-1 w-10 rounded-full bg-muted-foreground/20"
          />
          <ModalTitle className="pr-10 leading-6">
            {editor ? dayLabel(editor.day) : "Gün"} planı
          </ModalTitle>
          <ModalDescription className="text-xs leading-relaxed">
            Bu günü düzenle. Hesabına kaydetmek için ana ekrandaki Kaydet düğmesini kullan.
          </ModalDescription>
          {editor && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
                <span className="text-sm font-medium">
                  Bu gün {editor.enabled ? "açık" : "kapalı"}
                </span>
                <PreferenceSwitch
                  label="Bu gün açık"
                  enabled={editor.enabled}
                  busy={saving}
                  onToggle={() => setEditor({ ...editor, enabled: !editor.enabled })}
                />
              </div>
              <WaterReminderTimes
                key={editor.day}
                label={dayLabel(editor.day)}
                times={editor.times}
                disabled={saving}
                onChange={(times) => setEditor({ ...editor, times })}
              />
              <div className="space-y-2 border-t border-border pt-3">
                <QuickAction
                  label="Diğer günlere kopyala"
                  disabled={!editor.times.length}
                  onClick={() =>
                    copy(
                      editor,
                      `${dayLabel(editor.day)} planını kopyala`,
                      WEEK_DAYS.map(({ day }) => day),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => setEditor({ ...editor, enabled: false })}
                >
                  <PauseCircle aria-hidden="true" />
                  Bu günü kapat
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  disabled={!editor.times.length}
                  onClick={() =>
                    openOperation({
                      kind: "clear-day",
                      source: { ...editor, times: [...editor.times] },
                    })
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Bu günün saatlerini temizle
                </Button>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  updateDay(editor);
                  setEditor(null);
                }}
              >
                Uygula
              </Button>
            </>
          )}
        </ModalContent>
      </Modal>
      <Modal
        open={Boolean(operation)}
        onOpenChange={(open) => {
          if (!open) setOperation(null);
        }}
      >
        <ModalContent variant="centered" data-water-operation>
          <ModalTitle className="pr-10 leading-6">
            {operation?.kind === "copy"
              ? operation.title
              : operation?.kind === "clear-day"
                ? `${dayLabel(operation.source.day)} saatlerini temizle?`
                : "Tüm saatleri temizle?"}
          </ModalTitle>
          <ModalDescription className="text-xs leading-relaxed">
            {operation?.kind === "copy"
              ? "Seçtiğin günlerin saatleri değiştirilecek. Seçilmeyen günler korunur."
              : operation?.kind === "clear-day"
                ? "Bu günün tüm saatleri silinecek. Günün açık/kapalı durumu korunur."
                : "Su programındaki tüm saatler silinecek. Günlerin açık/kapalı durumu korunur."}
          </ModalDescription>
          {operation?.kind === "copy" && (
            <>
              <p className="rounded-xl bg-muted p-3 text-xs tabular-nums">
                {operation.source.times.join(" · ")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {copyTargets.map(({ day, label }) => {
                  const closed = !draft.days.find((entry) => entry.day === day)?.enabled;
                  return (
                    <label
                      key={day}
                      className={`flex min-h-11 items-center gap-2 rounded-xl border border-border p-3 text-xs ${closed && !includeClosed ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={targets.includes(day)}
                        disabled={closed && !includeClosed}
                        onChange={(event) =>
                          setTargets(
                            event.target.checked
                              ? [...targets, day]
                              : targets.filter((entry) => entry !== day),
                          )
                        }
                      />
                      {label}
                      {closed ? " (Kapalı)" : ""}
                    </label>
                  );
                })}
              </div>
              <label className="flex min-h-11 items-center gap-2 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={includeClosed}
                  onChange={(event) => {
                    setIncludeClosed(event.target.checked);
                    if (!event.target.checked)
                      setTargets(
                        targets.filter(
                          (day) => draft.days.find((entry) => entry.day === day)?.enabled,
                        ),
                      );
                  }}
                />
                Seçilen kapalı günleri de aç
              </label>
            </>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              variant="outline"
              onClick={() => setOperation(null)}
            >
              İptal
            </Button>
            <Button
              type="button"
              className="flex-1"
              variant={operation?.kind === "copy" ? "default" : "destructive"}
              disabled={operation?.kind === "copy" && !targets.length}
              onClick={applyOperation}
            >
              {operation?.kind === "copy" ? "Kopyala" : "Temizle"}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}

function QuickAction({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
