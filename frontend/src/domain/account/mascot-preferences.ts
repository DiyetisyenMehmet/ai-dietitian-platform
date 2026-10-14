export type MascotId = "classic" | "mirmir";
export interface MascotPreferences {
  mascotId: MascotId;
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
    mascotId: input?.mascotId === "mirmir" ? "mirmir" : "classic",
    animationEnabled: input?.animationEnabled !== false,
  };
}
