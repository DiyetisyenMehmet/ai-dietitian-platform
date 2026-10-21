export const MASCOT_OPTIONS = [
  { id: "classic", name: "Diewish Klasik" },
  { id: "diewish-robot", name: "Diewish Robot" },
  { id: "minis", name: "Miniş" },
  { id: "bilge", name: "Bilge" },
  { id: "enerjik", name: "Enerjik" },
  { id: "lina", name: "Lina" },
  { id: "bulut", name: "Bulut" },
  { id: "yesil-damla", name: "Yeşil Damla" },
  { id: "minik-bulut", name: "Minik Bulut" },
  { id: "mirmir", name: "Mırmır" },
  { id: "dost", name: "Dost" },
  { id: "nox", name: "Nox" },
  { id: "fit", name: "Fit" },
  { id: "guclu", name: "Güçlü" },
  { id: "tombis", name: "Tombiş" },
  { id: "mini-robot", name: "Mini Robot" },
] as const;
export type MascotId = (typeof MASCOT_OPTIONS)[number]["id"];
export function isMascotId(value: unknown): value is MascotId {
  return MASCOT_OPTIONS.some((option) => option.id === value);
}
export interface MascotPreferences {
  mascotId: MascotId;
  /** Legacy stored value retained for account/API compatibility; not a UI or playback option. */
  animationEnabled: boolean;
}
export const DEFAULT_MASCOT_PREFERENCES: MascotPreferences = {
  mascotId: "classic",
  animationEnabled: true,
};
export function normalizeMascotPreferences(
  input: Partial<MascotPreferences> | null | undefined,
): MascotPreferences {
  return {
    mascotId: isMascotId(input?.mascotId) ? input.mascotId : "classic",
    animationEnabled: input?.animationEnabled !== false,
  };
}
