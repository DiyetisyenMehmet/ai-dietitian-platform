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
  const generation = React.useRef(0);
  const userIdRef = React.useRef(userId);

  React.useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const reload = React.useCallback(async () => {
    const activeUserId = userId;
    const requestGeneration = ++generation.current;
    setPreferences(DEFAULT_DASHBOARD_CARD_PREFERENCES);
    setError(false);

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
        setPreferences(normalizeDashboardCardPreferences(stored));
      }
    } catch {
      if (
        requestGeneration === generation.current &&
        userIdRef.current === activeUserId
      ) {
        setError(true);
      }
    } finally {
      if (
        requestGeneration === generation.current &&
        userIdRef.current === activeUserId
      ) {
        setLoading(false);
      }
    }
  }, [userId]);

  React.useEffect(() => {
    void reload();
    return () => {
      generation.current += 1;
    };
  }, [reload]);

  const save = React.useCallback(
    async (next: DashboardCardPreferences) => {
      if (!userId) return false;
      const normalized = normalizeDashboardCardPreferences(next);
      const previous = preferences;
      const activeUserId = userId;
      const requestGeneration = generation.current;
      setPreferences(normalized);
      setSaving(true);
      setError(false);

      try {
        const stored = await updateDashboardCardPreferences(normalized);
        if (
          requestGeneration === generation.current &&
          userIdRef.current === activeUserId
        ) {
          setPreferences(normalizeDashboardCardPreferences(stored));
        }
        return true;
      } catch {
        if (
          requestGeneration === generation.current &&
          userIdRef.current === activeUserId
        ) {
          setPreferences(previous);
          setError(true);
        }
        return false;
      } finally {
        if (
          requestGeneration === generation.current &&
          userIdRef.current === activeUserId
        ) {
          setSaving(false);
        }
      }
    },
    [preferences, userId],
  );

  return { preferences, loading, saving, error, save, reload };
}
