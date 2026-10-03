package com.diewish.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Device-local inbox for notifications that were actually shown on this Android device. */
public final class DiewishNotificationInboxStore {
    private static final String PREFS = "diewish_notification_inbox";
    private static final String ITEMS = "items";
    private static final int MAX_ITEMS = 100;

    private DiewishNotificationInboxStore() {}

    public static synchronized void record(
        Context context,
        String id,
        String serverId,
        String title,
        String body,
        String target,
        long occurredAt
    ) {
        String cleanId = clean(id, 160);
        String cleanTitle = clean(title, 120);
        String cleanBody = clean(body, 500);
        if (cleanId.isEmpty() || cleanTitle.isEmpty() || cleanBody.isEmpty()) return;

        JSONArray previous = read(context);
        JSONArray next = new JSONArray();
        try {
            JSONObject item = new JSONObject();
            item.put("id", cleanId);
            String cleanServerId = clean(serverId, 120);
            item.put("serverId", cleanServerId.isEmpty() ? JSONObject.NULL : cleanServerId);
            item.put("title", cleanTitle);
            item.put("body", cleanBody);
            item.put("target", NotificationRoutes.sanitizeTarget(target));
            item.put("occurredAt", occurredAt > 0 ? occurredAt : System.currentTimeMillis());
            item.put("readAt", JSONObject.NULL);
            next.put(item);

            for (int index = 0; index < previous.length() && next.length() < MAX_ITEMS; index++) {
                JSONObject existing = previous.optJSONObject(index);
                if (existing == null || cleanId.equals(existing.optString("id", ""))) continue;
                next.put(existing);
            }
        } catch (JSONException ignored) {
            return;
        }
        write(context, next);
    }

    public static synchronized void markRead(Context context, String id) {
        String cleanId = clean(id, 160);
        if (cleanId.isEmpty()) return;
        JSONArray items = read(context);
        boolean changed = false;
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.optJSONObject(index);
            if (item == null || !cleanId.equals(item.optString("id", ""))) continue;
            if (item.isNull("readAt") || item.optLong("readAt", 0L) <= 0L) {
                try {
                    item.put("readAt", System.currentTimeMillis());
                    changed = true;
                } catch (JSONException ignored) {
                    return;
                }
            }
        }
        if (changed) write(context, items);
    }

    public static synchronized int unreadCount(Context context) {
        JSONArray items = read(context);
        int count = 0;
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.optJSONObject(index);
            if (item != null && (item.isNull("readAt") || item.optLong("readAt", 0L) <= 0L)) {
                count += 1;
            }
        }
        return count;
    }

    public static synchronized String json(Context context) {
        return read(context).toString();
    }

    public static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(ITEMS).apply();
    }

    private static JSONArray read(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = preferences.getString(ITEMS, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void write(Context context, JSONArray items) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(ITEMS, items.toString())
            .apply();
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
