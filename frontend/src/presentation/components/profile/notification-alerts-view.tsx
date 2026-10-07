"use client";

import * as React from "react";
import { NotificationDeviceNotice } from "./notification-device-notice";
import Link from "next/link";
import { Bell, Play, Volume2, Vibrate } from "lucide-react";
import { toast } from "sonner";
import { NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@/domain/account/types";
import {
  SOUND_PRESETS,
  VIBRATION_PRESETS,
  alertForCategory,
  alertCategoryForPreference,
  type AlertCategory,
  type NotificationAlertPreference,
} from "@/domain/account/notification-alerts";
import { notificationClient } from "@/infrastructure/notifications/notification-client";
import {
  notificationAlertCapabilities,
  previewNotificationSound,
  stopNotificationSoundPreview,
  previewCategoryNotification,
  syncNotificationAlertPreferences,
  type AlertCapabilities,
} from "@/infrastructure/notifications/notification-alert-adapter";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";
import { CategoryIcon } from "./notification-preference-category";

export function NotificationAlertsLink({ category }: { category: AlertCategory }) {
  return (
    <Button asChild variant="outline" className="min-h-12 w-full justify-between">
      <Link href={`/profile/notifications/${category}/sound`}>
        <span className="flex items-center gap-2">
          <Volume2 className="size-4" aria-hidden="true" />
          Ses ve titreşim
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    </Button>
  );
}

export function NotificationAlertsView({ category }: { category: AlertCategory }) {
  const item = NOTIFICATION_PREFERENCES.find(
    (entry) => alertCategoryForPreference(entry.key) === category,
  )!;
  const [preferences, setPreferences] = React.useState<NotificationPreferences | null>(null);
  const [draft, setDraft] = React.useState<NotificationAlertPreference>(
    alertForCategory(null, category),
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewMessage, setPreviewMessage] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [audioBusy, setAudioBusy] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [caps, setCaps] = React.useState<AlertCapabilities>({
    platform: "unavailable",
    customSounds: false,
    vibration: false,
    silent: false,
    testNotification: false,
  });
  const lock = React.useRef(false);
  const previewLock = React.useRef(false);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreferences(null);
    setError(null);
    setSaved(false);
    setCaps(notificationAlertCapabilities());
    const refresh = () => setCaps(notificationAlertCapabilities());
    window.addEventListener("focus", refresh);
    void notificationClient
      .getPreferences()
      .then(({ preferences: next }) => {
        if (cancelled) return;
        setPreferences(next);
        setDraft(alertForCategory(next.categoryAlerts, category));
        syncNotificationAlertPreferences(next.categoryAlerts);
      })
      .catch(() => {
        if (!cancelled) setError("Ses ve titreşim tercihlerin yüklenemedi. Tekrar deneyebilirsin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      stopNotificationSoundPreview();
    };
  }, [attempt, category]);
  const stored = alertForCategory(preferences?.categoryAlerts, category);
  const dirty =
    stored.soundPreset !== draft.soundPreset || stored.vibrationPreset !== draft.vibrationPreset;
  const save = async () => {
    if (!preferences || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { preferences: next } = await notificationClient.updatePreferences({
        categoryAlerts: { [category]: draft },
      });
      const verified = alertForCategory(next.categoryAlerts, category);
      if (
        verified.soundPreset !== draft.soundPreset ||
        verified.vibrationPreset !== draft.vibrationPreset
      )
        throw new Error("Kayıt doğrulanamadı");
      setPreferences(next);
      setDraft(verified);
      setSaved(true);
      const applied = syncNotificationAlertPreferences(next.categoryAlerts);
      toast.success("Ses ve titreşim tercihin kaydedildi");
      if (caps.platform === "native" && caps.customSounds && !applied)
        setPreviewError(
          "Hesap tercihin kaydedildi; bu cihazdaki uygulama ayarı henüz uygulayamadı. Uygulamayı yeniden açıp kontrol edebilirsin.",
        );
    } catch {
      setDraft(stored);
      setError("Tercihin kaydedilemedi. Son kayıtlı ses ve titreşim ayarların geri yüklendi.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const listen = async (preset: (typeof SOUND_PRESETS)[number]["id"]) => {
    setAudioBusy(preset);
    setPreviewError(null);
    setPreviewMessage(null);
    try {
      await previewNotificationSound(preset);
    } catch {
      setPreviewError(
        "Ses önizlemesi çalınamadı. Cihaz sesini kontrol edip tekrar deneyebilirsin.",
      );
    } finally {
      setAudioBusy(null);
    }
  };
  const testPreview = async () => {
    if (previewLock.current) return;
    previewLock.current = true;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewMessage(null);
    try {
      setPreviewMessage(await previewCategoryNotification(category, draft));
    } catch (failure) {
      setPreviewError(
        failure instanceof Error
          ? failure.message
          : "Test bildirimi gönderilemedi. Tercihlerin değiştirilmedi.",
      );
    } finally {
      previewLock.current = false;
      setPreviewing(false);
    }
  };
  if (loading)
    return (
      <p role="status" aria-busy="true" className="py-5 text-sm text-muted-foreground">
        Ses ve titreşim tercihlerin yükleniyor…
      </p>
    );
  if (!preferences)
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Tekrar dene
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4" data-notification-alerts={category}>
      <div className="flex items-start gap-3 rounded-2xl bg-primary/5 p-4">
        <CategoryIcon category={item.key} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{item.label}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <NotificationDeviceNotice enabled={preferences[item.key]} />
      <nav
        aria-label="Bildirim ayarları"
        className="grid grid-cols-2 border-b border-border text-center text-sm"
      >
        <Link
          className="min-h-12 p-3 text-muted-foreground"
          href={`/profile/notifications/${category}`}
        >
          Program
        </Link>
        <span
          aria-current="page"
          className="min-h-12 border-b-2 border-primary p-3 font-semibold text-primary"
        >
          Ses ve titreşim
        </span>
      </nav>
      <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
        {caps.platform === "web"
          ? "Bu tarayıcı özel bildirim sesi ve titreşim deseni seçimini desteklemiyor. Sistem varsayılanı veya sessiz bildirim kullanılabilir; diğer cihazlarda kaydedilmiş tercihin korunur."
          : caps.platform === "native" && caps.customSounds
            ? "Tercihlerin hesabında saklanır. Cihazın bildirim kanalı, sessiz modu ve rahatsız etmeyin ayarları önceliklidir."
            : "Bu cihaz veya uygulama sürümü ses ve titreşim ayarlarını uygulayamıyor. Hesabındaki kayıtlı tercihin korunur."}
      </p>
      <Card>
        <CardContent className="p-4">
          <fieldset disabled={saving} className="min-w-0">
            <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Volume2 className="size-4 text-primary" aria-hidden="true" />
              Bildirim sesi
            </legend>
            <div className="divide-y divide-border">
              {SOUND_PRESETS.map((preset) => {
                const custom = "asset" in preset;
                const disabled = custom
                  ? !caps.customSounds
                  : preset.id === "silent"
                    ? !caps.silent
                    : caps.platform === "unavailable" ||
                      (caps.platform === "native" && !caps.silent);
                return (
                  <div key={preset.id} className="flex min-h-14 items-center gap-2">
                    <label
                      className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 text-sm ${disabled ? "text-muted-foreground" : "cursor-pointer"}`}
                    >
                      <input
                        type="radio"
                        name="notification-sound"
                        className="size-4 shrink-0 accent-primary"
                        value={preset.id}
                        checked={draft.soundPreset === preset.id}
                        disabled={disabled}
                        onChange={() => {
                          setDraft((value) => ({ ...value, soundPreset: preset.id }));
                          setSaved(false);
                          setError(null);
                        }}
                      />
                      <span className="min-w-0 break-words">{preset.label}</span>
                    </label>
                    {(custom || (preset.id === "system" && caps.customSounds)) && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="size-11 shrink-0 rounded-full p-0"
                        disabled={audioBusy !== null}
                        aria-label={`${preset.label} sesini dinle`}
                        onClick={() => void listen(preset.id)}
                      >
                        <Play className="size-4 text-primary" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Dinleme düğmesi gerçek ses dosyasını çalar; bildirim izni vermez ve tercihini kaydetmez.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <fieldset disabled={saving} className="min-w-0">
            <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Vibrate className="size-4 text-primary" aria-hidden="true" />
              Titreşim
            </legend>
            <div className="divide-y divide-border">
              {VIBRATION_PRESETS.map((preset) => (
                <label
                  key={preset.id}
                  className={`flex min-h-12 items-center gap-3 text-sm ${!caps.vibration ? "text-muted-foreground" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="notification-vibration"
                    className="size-4 shrink-0 accent-primary"
                    checked={draft.vibrationPreset === preset.id}
                    disabled={!caps.vibration}
                    value={preset.id}
                    onChange={() => {
                      setDraft((value) => ({ ...value, vibrationPreset: preset.id }));
                      setSaved(false);
                      setError(null);
                    }}
                  />
                  <span>{preset.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {!caps.vibration && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Bu cihazda titreşim desenini kontrol edemiyoruz. Kayıtlı tercihini değiştirmiyoruz.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="space-y-3 rounded-2xl bg-primary/5 p-4" data-alert-preview>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="size-4 text-primary" aria-hidden="true" />
          Test et
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Seçili ayarlarla yalnız bu cihazda örnek bildirim gösterilir. Hesabına hatırlatma
          eklenmez, sunucuya bildirim isteği gönderilmez ve kota kullanılmaz.
          {dirty ? " Seçimin henüz kaydedilmedi." : ""}
        </p>
        <Button
          variant="outline"
          className="min-h-12 w-full"
          disabled={!caps.testNotification || previewing || saving}
          isLoading={previewing}
          onClick={() => void testPreview()}
        >
          Test bildirimi gönder
        </Button>
        {!caps.testNotification && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Test bildirimi bu ortamda veya uygulama sürümünde kullanılamıyor.
          </p>
        )}
        {previewMessage && (
          <p role="status" className="text-xs leading-relaxed text-primary">
            {previewMessage}
          </p>
        )}
        {previewError && (
          <p role="alert" className="text-xs leading-relaxed text-destructive">
            {previewError}
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
        >
          {error}
        </p>
      )}
      <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm">
        <Button
          className="min-h-12 w-full"
          disabled={!dirty || saving || previewing}
          isLoading={saving}
          onClick={() => void save()}
        >
          Ses ve titreşimi kaydet
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
    </div>
  );
}
