export const DEFAULT_DASHBOARD_CARD_ORDER = [
  "food",
  "blood",
  "progress",
  "coach",
] as const;

export type DashboardCardId = (typeof DEFAULT_DASHBOARD_CARD_ORDER)[number];

export interface DashboardCardPreferences {
  order: DashboardCardId[];
  hidden: DashboardCardId[];
}

export interface RawDashboardCardPreferences {
  order?: readonly unknown[] | null;
  hidden?: readonly unknown[] | null;
}

export const MIN_VISIBLE_DASHBOARD_CARDS = 3;

function uniqueKnownIds(values: readonly unknown[] | null | undefined, registry: readonly string[]) {
  const known = new Set(registry);
  const result: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "string" || !known.has(value) || result.includes(value)) continue;
    result.push(value);
  }
  return result;
}

export function normalizeDashboardCardPreferenceIds(
  raw: RawDashboardCardPreferences | null | undefined,
  registry: readonly string[],
  minimumVisible = MIN_VISIBLE_DASHBOARD_CARDS,
): { order: string[]; hidden: string[] } {
  const defaultOrder = [...registry];
  const order = uniqueKnownIds(raw?.order, defaultOrder);

  for (let defaultIndex = 0; defaultIndex < defaultOrder.length; defaultIndex += 1) {
    const id = defaultOrder[defaultIndex];
    if (order.includes(id)) continue;

    const successor = defaultOrder
      .slice(defaultIndex + 1)
      .find((candidate) => order.includes(candidate));
    if (successor) {
      order.splice(order.indexOf(successor), 0, id);
    } else {
      order.push(id);
    }
  }

  let hidden = uniqueKnownIds(raw?.hidden, defaultOrder);
  const minVisible = Math.min(Math.max(0, minimumVisible), defaultOrder.length);
  let visibleCount = order.filter((id) => !hidden.includes(id)).length;

  if (visibleCount < minVisible) {
    for (const id of defaultOrder) {
      if (!hidden.includes(id)) continue;
      hidden = hidden.filter((candidate) => candidate !== id);
      visibleCount += 1;
      if (visibleCount >= minVisible) break;
    }
  }

  return { order, hidden };
}

export function normalizeDashboardCardPreferences(
  raw?: RawDashboardCardPreferences | null,
): DashboardCardPreferences {
  return normalizeDashboardCardPreferenceIds(
    raw,
    DEFAULT_DASHBOARD_CARD_ORDER,
    MIN_VISIBLE_DASHBOARD_CARDS,
  ) as DashboardCardPreferences;
}

export const DEFAULT_DASHBOARD_CARD_PREFERENCES: DashboardCardPreferences =
  normalizeDashboardCardPreferences({
    order: DEFAULT_DASHBOARD_CARD_ORDER,
    hidden: [],
  });

export function visibleDashboardCardIds(
  preferences: DashboardCardPreferences,
): DashboardCardId[] {
  return preferences.order.filter((id) => !preferences.hidden.includes(id));
}

export function reorderVisibleDashboardCards(
  preferences: DashboardCardPreferences,
  visibleOrder: readonly DashboardCardId[],
): DashboardCardPreferences {
  const currentVisible = visibleDashboardCardIds(preferences);
  if (
    visibleOrder.length !== currentVisible.length ||
    visibleOrder.some((id) => !currentVisible.includes(id))
  ) {
    return preferences;
  }

  let visibleIndex = 0;
  return normalizeDashboardCardPreferences({
    order: preferences.order.map((id) =>
      preferences.hidden.includes(id) ? id : visibleOrder[visibleIndex++],
    ),
    hidden: preferences.hidden,
  });
}

export function moveVisibleDashboardCard(
  preferences: DashboardCardPreferences,
  id: DashboardCardId,
  direction: "up" | "down",
): DashboardCardPreferences {
  const visible = visibleDashboardCardIds(preferences);
  const index = visible.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= visible.length) return preferences;
  const next = [...visible];
  [next[index], next[target]] = [next[target], next[index]];
  return reorderVisibleDashboardCards(preferences, next);
}

export function hideDashboardCard(
  preferences: DashboardCardPreferences,
  id: DashboardCardId,
): { preferences: DashboardCardPreferences; changed: boolean } {
  const visible = visibleDashboardCardIds(preferences);
  if (preferences.hidden.includes(id) || visible.length <= MIN_VISIBLE_DASHBOARD_CARDS) {
    return { preferences, changed: false };
  }
  return {
    preferences: normalizeDashboardCardPreferences({
      order: preferences.order,
      hidden: [...preferences.hidden, id],
    }),
    changed: true,
  };
}

export function showDashboardCard(
  preferences: DashboardCardPreferences,
  id: DashboardCardId,
): DashboardCardPreferences {
  return normalizeDashboardCardPreferences({
    order: preferences.order,
    hidden: preferences.hidden.filter((candidate) => candidate !== id),
  });
}
