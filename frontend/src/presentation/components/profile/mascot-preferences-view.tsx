"use client";

import Image from "next/image";
import { toast } from "sonner";
import { useMascotPreferences } from "@/application/account/mascot-preferences-provider";
import { MirmirMascot } from "@/presentation/components/mascot/mirmir-mascot";
import { DostMascot } from "@/presentation/components/mascot/dost-mascot";
import { Button } from "@/presentation/components/ui/button";
import type { MascotPreferences } from "@/domain/account/mascot-preferences";

const mascotNames = { classic: "Diewish Klasik", mirmir: "Mırmır", dost: "Dost" } as const;

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
      <fieldset disabled={saving || error} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <legend className="sr-only">Maskot seçimi</legend>
        {(["classic", "mirmir", "dost"] as const).map((id) => (
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
            ) : id === "dost" ? (
              <DostMascot className="size-24" />
            ) : (
              <MirmirMascot className="size-24" />
            )}
            <span className="text-sm font-semibold">{mascotNames[id]}</span>
            <input
              type="radio"
              name="mascot"
              value={id}
              aria-label={mascotNames[id]}
              checked={preferences.mascotId === id}
              onChange={() => void update({ mascotId: id })}
              className="size-4 accent-primary"
            />
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground" role="status">
        {saving
          ? "Kaydediliyor…"
          : "Tercihlerin hesabına kaydedilir ve diğer cihazlarında da kullanılır."}
      </p>
    </div>
  );
}
