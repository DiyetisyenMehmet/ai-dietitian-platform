package com.diewish.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Persists and schedules generic nutrition-plan reminders without storing health
 * profile details or meal contents in notification payloads.
 */
public final class NutritionReminderScheduler {
    private static final String PREFS = "diewish_nutrition_reminders";
    private static final String KEY_SCHEDULE = "schedule";
    private static final int MAX_REMINDERS = 240;
    private static final long MAX_FUTURE_MS = 45L * 24L * 60L * 60L * 1000L;

    private NutritionReminderScheduler() {}

    public static int replace(Context context, String json) throws JSONException {
        JSONArray source = new JSONArray(json);
        JSONArray sanitized = sanitize(source);
        cancelStored(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SCHEDULE, sanitized.toString())
            .apply();
        scheduleArray(context, sanitized);
        return sanitized.length();
    }

    public static void cancelAll(Context context) {
        cancelStored(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SCHEDULE)
            .apply();
    }

    public static void rescheduleStored(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SCHEDULE, null);
        if (raw == null || raw.isEmpty()) return;
        try {
            scheduleArray(context, sanitize(new JSONArray(raw)));
        } catch (JSONException ignored) {
            cancelAll(context);
        }
    }

    private static JSONArray sanitize(JSONArray source) throws JSONException {
        JSONArray result = new JSONArray();
        long now = System.currentTimeMillis();
        long maxFuture = now + MAX_FUTURE_MS;
        for (int index = 0; index < source.length() && result.length() < MAX_REMINDERS; index++) {
            JSONObject row = source.optJSONObject(index);
            if (row == null) continue;
            String id = row.optString("id", "").trim();
            long at = row.optLong("at", 0L);
            if (id.isEmpty() || id.length() > 96 || at <= now || at > maxFuture) continue;

            JSONObject clean = new JSONObject();
            clean.put("id", id);
            clean.put("at", at);
            result.put(clean);
        }
        return result;
    }

    private static void scheduleArray(Context context, JSONArray schedule) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long now = System.currentTimeMillis();
        for (int index = 0; index < schedule.length(); index++) {
            JSONObject row = schedule.optJSONObject(index);
            if (row == null) continue;
            String id = row.optString("id", "");
            long at = row.optLong("at", 0L);
            if (id.isEmpty() || at <= now) continue;
            alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                at,
                pendingIntent(context, id)
            );
        }
    }

    private static void cancelStored(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SCHEDULE, null);
        if (raw == null || raw.isEmpty()) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        try {
            JSONArray schedule = new JSONArray(raw);
            for (int index = 0; index < schedule.length(); index++) {
                JSONObject row = schedule.optJSONObject(index);
                if (row == null) continue;
                String id = row.optString("id", "");
                if (!id.isEmpty()) alarms.cancel(pendingIntent(context, id));
            }
        } catch (JSONException ignored) {
        }
    }

    private static PendingIntent pendingIntent(Context context, String id) {
        Intent intent = new Intent(context, NutritionReminderReceiver.class)
            .setAction("com.diewish.app.NUTRITION_REMINDER")
            .setData(Uri.parse("diewish://nutrition-reminder/" + Uri.encode(id)))
            .putExtra("reminderId", id);
        return PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
