"use client";

import Image from "next/image";
import { toast } from "sonner";
import { useMascotPreferences } from "@/application/account/mascot-preferences-provider";
import { MirmirMascot } from "@/presentation/components/mascot/mirmir-mascot";
import { Button } from "@/presentation/components/ui/button";
import type { MascotPreferences } from "@/domain/account/mascot-preferences";

export function MascotPreferencesView() {
  const { preferences, loading, saving, error, reload, save } = useMascotPreferences();
  const update = async (patch: Partial<MascotPreferences>) => {
    if (await save(patch)) toast.success("Maskot tercihin kaydedildi.");
    else toast.error("Tercihin kaydedilemedi. Lütfen tekrar dene.");
  };
  if (loading)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" role="status">
        Maskot tercihlerin yükleniyor…
      </p>
    );
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Ana sayfa ve Diewish Koçta sana eşlik edecek maskotu seç.
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p>Maskot tercihin doğrulanamadı. Tekrar yükleyip dene.</p>
          <Button variant="outline" className="mt-3" onClick={() => void reload()}>
            Tekrar yükle
          </Button>
        </div>
      )}
      <fieldset disabled={saving || error} className="grid grid-cols-2 gap-3">
        <legend className="sr-only">Maskot seçimi</legend>
        {(["classic", "mirmir"] as const).map((id) => (
          <label
            key={id}
            className="relative flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4 text-center shadow-card has-[:disabled]:cursor-wait has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            {id === "classic" ? (
              <Image
                src="/images/diewish/semantic/diewish-coach-avatar.png"
                alt=""
                width={96}
                height={96}
                unoptimized
                className="size-24 object-contain"
              />
            ) : (
              <MirmirMascot
                className="size-24"
                animationEnabled={preferences.mascotId === "mirmir" && preferences.animationEnabled}
              />
            )}
            <span className="text-sm font-semibold">
              {id === "classic" ? "Diewish Klasik" : "Mırmır"}
            </span>
            <input
              type="radio"
              name="mascot"
              value={id}
              aria-label={id === "classic" ? "Diewish Klasik" : "Mırmır"}
              checked={preferences.mascotId === id}
              onChange={() => void update({ mascotId: id })}
              className="size-4 accent-primary"
            />
          </label>
        ))}
      </fieldset>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          <span>Maskot animasyonu</span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{preferences.animationEnabled ? "Açık" : "Kapalı"}</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Maskot animasyonu"
              checked={preferences.animationEnabled}
              disabled={saving || error}
              onChange={(event) => void update({ animationEnabled: event.target.checked })}
              className="size-5 accent-primary"
            />
          </span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Mırmır arada bir göz kırpar. Cihazının hareket azaltma tercihi her zaman korunur.
        </p>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {saving
          ? "Kaydediliyor…"
          : "Tercihlerin hesabına kaydedilir ve diğer cihazlarında da kullanılır."}
      </p>
    </div>
  );
}
