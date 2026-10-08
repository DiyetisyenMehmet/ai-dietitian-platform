package com.diewish.app;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONObject;

/** Device copy of account preferences, refreshed by the existing account sync. */
public final class NotificationAlertStore {
    private static final String PREFS = "diewish_notification_alerts";
    private NotificationAlertStore() {}
    public static boolean replace(Context context, String raw) {
        if (raw == null || raw.length() > 4096) return false;
        try {
            JSONObject input = new JSONObject(raw), clean = new JSONObject();
            for (String category : NotificationAlertPolicy.CATEGORIES) {
                JSONObject item = input.optJSONObject(category);
                clean.put(category, preference(item));
            }
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("categories", clean.toString()).commit();
        } catch (JSONException exception) { return false; }
    }
    public static JSONObject preference(JSONObject item) throws JSONException {
        JSONObject clean = new JSONObject();
        clean.put("soundPreset", NotificationAlertPolicy.sound(item == null ? null : item.optString("soundPreset")));
        clean.put("vibrationPreset", NotificationAlertPolicy.vibration(item == null ? null : item.optString("vibrationPreset")));
        return clean;
    }
    public static JSONObject get(Context context, String category) {
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("categories", "{}");
            return preference(new JSONObject(raw).optJSONObject(category));
        } catch (JSONException ignored) { return new JSONObject(); }
    }
    public static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
