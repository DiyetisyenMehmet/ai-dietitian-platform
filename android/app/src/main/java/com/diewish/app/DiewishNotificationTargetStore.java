package com.diewish.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Private device-only storage for one pending, allowlisted notification target. */
public final class DiewishNotificationTargetStore {
    private static final String PREFS = "diewish_notification_navigation";
    private static final String PENDING_PATH = "pending_path";

    private DiewishNotificationTargetStore() {}

    public static void save(Context context, String path) {
        String target = NotificationRoutes.sanitizeTarget(path);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PENDING_PATH, target)
            .apply();
    }

    public static String get(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String stored = preferences.getString(PENDING_PATH, "");
        if (stored == null || stored.isBlank()) return "";
        return NotificationRoutes.sanitizeTarget(stored);
    }

    public static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(PENDING_PATH)
            .apply();
    }
}
