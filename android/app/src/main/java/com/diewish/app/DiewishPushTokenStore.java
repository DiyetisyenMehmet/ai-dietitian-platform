package com.diewish.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Private device-only storage for the current FCM registration token. */
public final class DiewishPushTokenStore {
    private static final String PREFS = "diewish_push";
    private static final String TOKEN = "token";

    private DiewishPushTokenStore() {}

    public static void save(Context context, String token) {
        if (token == null || token.isBlank()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TOKEN, token)
            .apply();
    }

    public static String get(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return preferences.getString(TOKEN, "");
    }

    public static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(TOKEN)
            .apply();
    }
}
