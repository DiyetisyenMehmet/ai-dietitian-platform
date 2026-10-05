export const DEFAULT_DASHBOARD_CARD_ORDER = [
  "food",
  "blood",
  "progress",
  "coach",
] as const;

export const DEFAULT_DASHBOARD_QUICK_ACTION_ORDER = [
  "meal",
  "water",
  "activity",
  "weight",
] as const;

export type DashboardCardId = (typeof DEFAULT_DASHBOARD_CARD_ORDER)[number];
export type DashboardQuickActionId =
  (typeof DEFAULT_DASHBOARD_QUICK_ACTION_ORDER)[number];

export interface DashboardCardPreferences {
  order: DashboardCardId[];
  hidden: DashboardCardId[];
  quickActionOrder: DashboardQuickActionId[];
  hiddenQuickActionIds: DashboardQuickActionId[];
}

export interface RawDashboardCardPreferences {
  order?: readonly unknown[] | null;
  hidden?: readonly unknown[] | null;
  quickActionOrder?: readonly unknown[] | null;
  hiddenQuickActionIds?: readonly unknown[] | null;
}

export const MIN_VISIBLE_DASHBOARD_CARDS = 3;
export const MIN_VISIBLE_DASHBOARD_QUICK_ACTIONS = 3;
export const MAX_VISIBLE_DASHBOARD_QUICK_ACTIONS = 5;

function uniqueKnownIds(
  values: readonly unknown[] | null | undefined,
  registry: readonly string[],
) {
  const known = new Set(registry);
  const result: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "string" || !known.has(value) || result.includes(value)) continue;
    result.push(value);
  }
  return result;
}

export function normalizeDashboardPreferenceIds(
  orderInput: readonly unknown[] | null | undefined,
  hiddenInput: readonly unknown[] | null | undefined,
  registry: readonly string[],
  minimumVisible: number,
): { order: string[]; hidden: string[] } {
  const defaultOrder = [...registry];
  const order = uniqueKnownIds(orderInput, defaultOrder);

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

  let hidden = uniqueKnownIds(hiddenInput, defaultOrder);
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

export function normalizeDashboardCardPreferenceIds(
  raw: RawDashboardCardPreferences | null | undefined,
  registry: readonly string[],
  minimumVisible = MIN_VISIBLE_DASHBOARD_CARDS,
): { order: string[]; hidden: string[] } {
  return normalizeDashboardPreferenceIds(
    raw?.order,
    raw?.hidden,
    registry,
    minimumVisible,
  );
}

export function normalizeDashboardCardPreferences(
  raw?: RawDashboardCardPreferences | null,
): DashboardCardPreferences {
  const cards = normalizeDashboardPreferenceIds(
    raw?.order,
    raw?.hidden,
    DEFAULT_DASHBOARD_CARD_ORDER,
    MIN_VISIBLE_DASHBOARD_CARDS,
  );
  const quickActions = normalizeDashboardPreferenceIds(
    raw?.quickActionOrder,
    raw?.hiddenQuickActionIds,
    DEFAULT_DASHBOARD_QUICK_ACTION_ORDER,
    MIN_VISIBLE_DASHBOARD_QUICK_ACTIONS,
  );

  return {
    order: cards.order as DashboardCardId[],
    hidden: cards.hidden as DashboardCardId[],
    quickActionOrder: quickActions.order as DashboardQuickActionId[],
    hiddenQuickActionIds: quickActions.hidden as DashboardQuickActionId[],
  };
}

export const DEFAULT_DASHBOARD_CARD_PREFERENCES: DashboardCardPreferences =
  normalizeDashboardCardPreferences({
    order: DEFAULT_DASHBOARD_CARD_ORDER,
    hidden: [],
    quickActionOrder: DEFAULT_DASHBOARD_QUICK_ACTION_ORDER,
    hiddenQuickActionIds: [],
  });

export function visibleDashboardCardIds(
  preferences: DashboardCardPreferences,
): DashboardCardId[] {
  return preferences.order.filter((id) => !preferences.hidden.includes(id));
}

export function visibleDashboardQuickActionIds(
  preferences: DashboardCardPreferences,
): DashboardQuickActionId[] {
  return preferences.quickActionOrder.filter(
    (id) => !preferences.hiddenQuickActionIds.includes(id),
  );
}

function reorderVisibleIds<T extends string>(
  order: readonly T[],
  hidden: readonly T[],
  visibleOrder: readonly T[],
): T[] | null {
  const currentVisible = order.filter((id) => !hidden.includes(id));
  if (
    visibleOrder.length !== currentVisible.length ||
    visibleOrder.some((id) => !currentVisible.includes(id))
  ) {
    return null;
  }

  let visibleIndex = 0;
  return order.map((id) =>
    hidden.includes(id) ? id : visibleOrder[visibleIndex++],
  );
}

export function reorderVisibleDashboardCards(
  preferences: DashboardCardPreferences,
  visibleOrder: readonly DashboardCardId[],
): DashboardCardPreferences {
  const nextOrder = reorderVisibleIds(
    preferences.order,
    preferences.hidden,
    visibleOrder,
  );
  if (!nextOrder) return preferences;
  return normalizeDashboardCardPreferences({
    ...preferences,
    order: nextOrder,
  });
}

export function reorderVisibleDashboardQuickActions(
  preferences: DashboardCardPreferences,
  visibleOrder: readonly DashboardQuickActionId[],
): DashboardCardPreferences {
  const nextOrder = reorderVisibleIds(
    preferences.quickActionOrder,
    preferences.hiddenQuickActionIds,
    visibleOrder,
  );
  if (!nextOrder) return preferences;
  return normalizeDashboardCardPreferences({
    ...preferences,
    quickActionOrder: nextOrder,
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

export function moveVisibleDashboardQuickAction(
  preferences: DashboardCardPreferences,
  id: DashboardQuickActionId,
  direction: "left" | "right",
): DashboardCardPreferences {
  const visible = visibleDashboardQuickActionIds(preferences);
  const index = visible.indexOf(id);
  const target = direction === "left" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= visible.length) return preferences;
  const next = [...visible];
  [next[index], next[target]] = [next[target], next[index]];
  return reorderVisibleDashboardQuickActions(preferences, next);
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
      ...preferences,
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
    ...preferences,
    hidden: preferences.hidden.filter((candidate) => candidate !== id),
  });
}

export function hideDashboardQuickAction(
  preferences: DashboardCardPreferences,
  id: DashboardQuickActionId,
): { preferences: DashboardCardPreferences; changed: boolean } {
  const visible = visibleDashboardQuickActionIds(preferences);
  if (
    preferences.hiddenQuickActionIds.includes(id) ||
    visible.length <= MIN_VISIBLE_DASHBOARD_QUICK_ACTIONS
  ) {
    return { preferences, changed: false };
  }
  return {
    preferences: normalizeDashboardCardPreferences({
      ...preferences,
      hiddenQuickActionIds: [...preferences.hiddenQuickActionIds, id],
    }),
    changed: true,
  };
}

export function showDashboardQuickAction(
  preferences: DashboardCardPreferences,
  id: DashboardQuickActionId,
): DashboardCardPreferences {
  return normalizeDashboardCardPreferences({
    ...preferences,
    hiddenQuickActionIds: preferences.hiddenQuickActionIds.filter(
      (candidate) => candidate !== id,
    ),
  });
}
