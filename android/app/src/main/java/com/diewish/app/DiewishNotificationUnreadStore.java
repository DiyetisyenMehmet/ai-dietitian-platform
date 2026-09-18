package com.diewish.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.HashSet;
import java.util.Set;

/** Device-local unread state for notifications currently not opened/dismissed by the user. */
public final class DiewishNotificationUnreadStore {
    private static final String PREFS = "diewish_notification_unread";
    private static final String IDS = "unread_ids";
    private static final int MAX_IDS = 99;

    private DiewishNotificationUnreadStore() {}

    public static void markUnread(Context context, String id) {
        String clean = clean(id);
        if (clean.isEmpty()) return;
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>(preferences.getStringSet(IDS, Set.of()));
        ids.add(clean);
        if (ids.size() > MAX_IDS) {
            // The in-app badge is capped at 99+, so bound device-only state too.
            while (ids.size() > MAX_IDS) {
                ids.remove(ids.iterator().next());
            }
        }
        preferences.edit().putStringSet(IDS, ids).apply();
    }

    public static void markRead(Context context, String id) {
        String clean = clean(id);
        if (clean.isEmpty()) return;
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>(preferences.getStringSet(IDS, Set.of()));
        if (ids.remove(clean)) {
            preferences.edit().putStringSet(IDS, ids).apply();
        }
    }

    public static int count(Context context) {
        Set<String> ids = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(IDS, Set.of());
        return ids == null ? 0 : ids.size();
    }

    private static String clean(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.length() <= 160 ? trimmed : trimmed.substring(0, 160);
    }
}
