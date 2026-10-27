"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/application/auth/auth-store";
import { apiRequest } from "@/infrastructure/api/http-client";
import {
  DEFAULT_MASCOT_PREFERENCES,
  normalizeMascotPreferences,
  type MascotPreferences,
} from "@/domain/account/mascot-preferences";

interface MascotState {
  preferences: MascotPreferences;
  loading: boolean;
  saving: boolean;
  /** GET confirmation failed; a rejected PATCH leaves the last confirmation intact. */
  error: boolean;
  reload: () => Promise<void>;
  save: (patch: Partial<MascotPreferences>) => Promise<boolean>;
}
const MascotContext = React.createContext<MascotState>({
  preferences: DEFAULT_MASCOT_PREFERENCES,
  loading: true,
  saving: false,
  error: false,
  reload: async () => {},
  save: async () => false,
});

/** One account-scoped source for both placements. Never reads health/chat data. */
export function MascotPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const enabled =
    status === "authenticated" && !pathname.startsWith("/admin") && pathname !== "/auth/action";
  const userId = enabled ? (user?.id ?? null) : null;
  const activeUser = React.useRef(userId);
  activeUser.current = userId;
  const generation = React.useRef(0);
  const saveLock = React.useRef(false);
  const previousPath = React.useRef(pathname);
  const [state, setState] = React.useState({
    owner: null as string | null,
    preferences: DEFAULT_MASCOT_PREFERENCES,
    loading: true,
    saving: false,
    error: false,
  });

  const reload = React.useCallback(async () => {
    if (!userId || saveLock.current) return;
    const version = ++generation.current;
    try {
      const result = await apiRequest<{ preferences: MascotPreferences }>({
        path: "/account/mascot",
        method: "GET",
        auth: true,
      });
      if (generation.current !== version || activeUser.current !== userId) return;
      setState({
        owner: userId,
        preferences: normalizeMascotPreferences(result.preferences),
        loading: false,
        saving: false,
        error: false,
      });
    } catch {
      if (generation.current === version && activeUser.current === userId) {
        setState((old) => ({
          ...old,
          owner: userId,
          preferences: old.owner === userId ? old.preferences : DEFAULT_MASCOT_PREFERENCES,
          loading: false,
          error: true,
        }));
      }
    }
  }, [userId]);

  React.useEffect(() => {
    generation.current += 1;
    saveLock.current = false;
    setState({
      owner: userId,
      preferences: DEFAULT_MASCOT_PREFERENCES,
      loading: Boolean(userId),
      saving: false,
      error: false,
    });
    void reload();
    return () => {
      generation.current += 1;
    };
  }, [userId, reload]);

  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const nativeRefresh = (event: Event) => {
      if ((event as CustomEvent<{ active: boolean }>).detail?.active) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("diewish:app-visibility", nativeRefresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("diewish:app-visibility", nativeRefresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  React.useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (pathname === "/dashboard" || pathname === "/ai" || pathname === "/profile/mascot")
      void reload();
  }, [pathname, reload]);

  const save = React.useCallback(
    async (patch: Partial<MascotPreferences>) => {
      if (!userId || state.owner !== userId || state.loading || state.error || saveLock.current)
        return false;
      saveLock.current = true;
      const version = ++generation.current;
      setState((old) => ({ ...old, saving: true, error: false }));
      try {
        const result = await apiRequest<{ preferences: MascotPreferences }>({
          path: "/account/mascot",
          method: "PATCH",
          auth: true,
          body: JSON.stringify(patch),
        });
        if (generation.current !== version || activeUser.current !== userId) return false;
        setState({
          owner: userId,
          preferences: normalizeMascotPreferences(result.preferences),
          loading: false,
          saving: false,
          error: false,
        });
        return true;
      } catch {
        if (generation.current === version && activeUser.current === userId)
          setState((old) => ({ ...old, saving: false }));
        return false;
      } finally {
        if (generation.current === version) saveLock.current = false;
      }
    },
    [state.owner, state.loading, state.error, userId],
  );

  const belongsToAccount = state.owner === userId;
  return (
    <MascotContext.Provider
      value={{
        preferences: belongsToAccount ? state.preferences : DEFAULT_MASCOT_PREFERENCES,
        loading: !belongsToAccount || state.loading,
        saving: belongsToAccount && state.saving,
        error: belongsToAccount && state.error,
        reload,
        save,
      }}
    >
      {children}
    </MascotContext.Provider>
  );
}
export function useMascotPreferences() {
  return React.useContext(MascotContext);
}
