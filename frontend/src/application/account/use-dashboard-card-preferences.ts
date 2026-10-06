"use client";

import * as React from "react";

import {
  DEFAULT_DASHBOARD_CARD_PREFERENCES,
  normalizeDashboardCardPreferences,
  type DashboardCardPreferences,
} from "@/domain/account/dashboard-card-preferences";
import {
  getDashboardCardPreferences,
  updateDashboardCardPreferences,
} from "@/infrastructure/account/account-client";

export interface DashboardCardPreferencesState {
  preferences: DashboardCardPreferences;
  loading: boolean;
  loadError: boolean;
  saving: boolean;
  error: boolean;
  save: (next: DashboardCardPreferences) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useDashboardCardPreferences(
  userId: string | null | undefined,
): DashboardCardPreferencesState {
  const [preferences, setPreferences] = React.useState<DashboardCardPreferences>(
    DEFAULT_DASHBOARD_CARD_PREFERENCES,
  );
  const [loading, setLoading] = React.useState(Boolean(userId));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);

  const generation = React.useRef(0);
  const userIdRef = React.useRef(userId);
  const confirmedRef = React.useRef<DashboardCardPreferences>(
    DEFAULT_DASHBOARD_CARD_PREFERENCES,
  );
  const latestSaveIdRef = React.useRef(0);
  const pendingCountRef = React.useRef(0);
  const saveQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  userIdRef.current = userId;

  const applyPreferences = React.useCallback((next: DashboardCardPreferences) => {
    setPreferences(next);
  }, []);

  const reload = React.useCallback(async () => {
    const activeUserId = userId;
    const requestGeneration = ++generation.current;
    latestSaveIdRef.current += 1;
    saveQueueRef.current = Promise.resolve();
    pendingCountRef.current = 0;
    setSaving(false);
    applyPreferences(DEFAULT_DASHBOARD_CARD_PREFERENCES);
    confirmedRef.current = DEFAULT_DASHBOARD_CARD_PREFERENCES;
    setError(false);
    setLoadError(false);

    if (!activeUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const stored = await getDashboardCardPreferences();
      if (
        requestGeneration === generation.current &&
        userIdRef.current === activeUserId
      ) {
        const normalized = normalizeDashboardCardPreferences(stored);
        confirmedRef.current = normalized;
        applyPreferences(normalized);
      }
    } catch {
      if (
        requestGeneration === generation.current &&
        userIdRef.current === activeUserId
      ) {
        setError(true);
        setLoadError(true);
      }
    } finally {
      if (
        requestGeneration === generation.current &&
        userIdRef.current === activeUserId
      ) {
        setLoading(false);
      }
    }
  }, [applyPreferences, userId]);

  React.useEffect(() => {
    void reload();
    return () => {
      generation.current += 1;
    };
  }, [reload]);

  const save = React.useCallback(
    (next: DashboardCardPreferences): Promise<boolean> => {
      if (!userId) return Promise.resolve(false);

      const normalized = normalizeDashboardCardPreferences(next);
      const activeUserId = userId;
      const requestGeneration = generation.current;
      const saveId = ++latestSaveIdRef.current;

      setError(false);
      pendingCountRef.current += 1;
      setSaving(true);

      const task = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (
            requestGeneration !== generation.current ||
            userIdRef.current !== activeUserId
          ) {
            return false;
          }

          try {
            const stored = await updateDashboardCardPreferences(normalized);
            if (
              requestGeneration !== generation.current ||
              userIdRef.current !== activeUserId
            ) return false;
            const confirmed = normalizeDashboardCardPreferences(stored);
            confirmedRef.current = confirmed;
            if (saveId === latestSaveIdRef.current) {
              applyPreferences(confirmed);
            }
            return true;
          } catch {
            if (
              requestGeneration === generation.current &&
              userIdRef.current === activeUserId &&
              saveId === latestSaveIdRef.current
            ) {
              applyPreferences(confirmedRef.current);
              setError(true);
            }
            return false;
          } finally {
            if (
              requestGeneration === generation.current &&
              userIdRef.current === activeUserId
            ) {
              pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
              if (pendingCountRef.current === 0) setSaving(false);
            }
          }
        });

      saveQueueRef.current = task.then(() => undefined, () => undefined);
      return task;
    },
    [applyPreferences, userId],
  );

  return { preferences, loading, loadError, saving, error, save, reload };
}
