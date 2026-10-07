package com.diewish.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Persists and restores opt-in, privacy-minimal wellness reminder alarms. */
public final class WellnessReminderScheduler {
    private static final String PREFS = "diewish_wellness_reminders";
    private static final String KEY_SCHEDULE = "schedule";
    private static final int MAX_REMINDERS = 128;
    private static final long MAX_FUTURE_MS = 45L * 24L * 60L * 60L * 1000L;

    private WellnessReminderScheduler() {}

    public static synchronized int replace(Context context, String json) throws JSONException {
        JSONArray sanitized = sanitize(new JSONArray(json));
        String previous = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SCHEDULE, null);
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SCHEDULE, sanitized.toString()).commit()) throw new JSONException("Device schedule could not be persisted");
        cancelArray(context, previous);
        scheduleArray(context, sanitized);
        return sanitized.length();
    }

    public static synchronized void cancelAll(Context context) {
        cancelStored(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_SCHEDULE).apply();
    }

    /** Replaces old persisted schedules so removed reminder types are cancelled. */
    public static synchronized void rescheduleStored(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SCHEDULE, null);
        if (raw == null || raw.isEmpty()) return;
        try {
            JSONArray stored = new JSONArray(raw);
            long now = System.currentTimeMillis();
            for (int index = 0; index < stored.length(); index++) {
                JSONObject row = stored.optJSONObject(index);
                if (isRecurringWater(row)) row.put("at", WaterReminderRenewal.nextAt(row.optLong("at"), now, java.util.TimeZone.getDefault()));
            }
            replace(context, stored.toString());
        } catch (JSONException ignored) {
            cancelAll(context);
        }
    }

    private static JSONArray sanitize(JSONArray source) throws JSONException {
        if (source.length() > MAX_REMINDERS) throw new JSONException("Device reminder limit exceeded");
        JSONArray result = new JSONArray();
        java.util.HashSet<String> ids = new java.util.HashSet<>();
        long now = System.currentTimeMillis();
        long maxFuture = now + MAX_FUTURE_MS;
        for (int index = 0; index < source.length() && result.length() < MAX_REMINDERS; index++) {
            JSONObject row = source.optJSONObject(index);
            if (row == null) continue;
            String id = row.optString("id", "").trim();
            String type = row.optString("type", "").trim();
            long at = row.optLong("at", 0L);
            if (id.isEmpty() || id.length() > 96 || !isAllowedType(type) || at <= now || at > maxFuture || !ids.add(id)) continue;
            JSONObject clean = new JSONObject();
            clean.put("id", id);
            clean.put("type", type);
            clean.put("at", at);
            if (isRecurringWater(row)) clean.put("repeatDays", 7);
            result.put(clean);
        }
        return result;
    }

    private static boolean isRecurringWater(JSONObject row) {
        return row != null && "water".equals(row.optString("type")) && row.optInt("repeatDays") == 7;
    }

    /** Consume only the still-current alarm, renewing before permission checks. */
    public static synchronized boolean consume(Context context, String id, String type, long expectedAt) {
        if (id == null || !isAllowedType(type)) return false;
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SCHEDULE, null);
        if (raw == null) return false;
        try {
            JSONArray stored = new JSONArray(raw);
            for (int index = 0; index < stored.length(); index++) {
                JSONObject row = stored.optJSONObject(index);
                if (row == null || !id.equals(row.optString("id")) || !type.equals(row.optString("type"))) continue;
                long due = row.optLong("at");
                long now = System.currentTimeMillis();
                if ((expectedAt != 0 && expectedAt != due) || due > now) return false;
                if (isRecurringWater(row)) {
                    row.put("at", WaterReminderRenewal.nextAt(due, now, java.util.TimeZone.getDefault()));
                } else {
                    stored.remove(index);
                }
                if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(KEY_SCHEDULE, stored.toString()).commit()) return false;
                if (isRecurringWater(row)) scheduleArray(context, new JSONArray().put(row));
                return true;
            }
        } catch (JSONException ignored) { }
        return false;
    }

    private static boolean isAllowedType(String type) {
        // Weekly summaries are remote/account-aware. Keeping them out of the
        // local AlarmManager prevents one preference from producing two alerts.
        return "water".equals(type) || "activity".equals(type) || "sleep".equals(type);
    }

    private static void scheduleArray(Context context, JSONArray schedule) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long now = System.currentTimeMillis();
        for (int index = 0; index < schedule.length(); index++) {
            JSONObject row = schedule.optJSONObject(index);
            if (row == null) continue;
            String id = row.optString("id", "");
            String type = row.optString("type", "");
            long at = row.optLong("at", 0L);
            if (id.isEmpty() || !isAllowedType(type) || at <= now) continue;
            ReminderAlarmPolicy.schedule(alarms, at, pendingIntent(context, id, type, at));
        }
    }

    public static boolean scheduleTest(Context context, int delaySeconds) {
        if (!"staging".equals(BuildConfig.APP_ENVIRONMENT)) return false;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return false;
        int boundedDelay = Math.max(10, Math.min(delaySeconds, 300));
        long triggerAt = System.currentTimeMillis() + boundedDelay * 1000L;
        String id = "manual-test-" + triggerAt;
        ReminderAlarmPolicy.schedule(
            alarms,
            triggerAt,
            pendingIntent(context, id, "test", triggerAt)
        );
        return true;
    }

    private static void cancelStored(Context context) {
        cancelArray(context, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SCHEDULE, null));
    }

    private static void cancelArray(Context context, String raw) {
        if (raw == null || raw.isEmpty()) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        try {
            JSONArray schedule = new JSONArray(raw);
            for (int index = 0; index < schedule.length(); index++) {
                JSONObject row = schedule.optJSONObject(index);
                if (row == null) continue;
                String id = row.optString("id", "");
                String type = row.optString("type", "");
                if (!id.isEmpty()) alarms.cancel(pendingIntent(context, id, type, row.optLong("at")));
            }
        } catch (JSONException ignored) {
        }
    }

    private static PendingIntent pendingIntent(Context context, String id, String type, long at) {
        Intent intent = new Intent(context, WellnessReminderReceiver.class)
            .setAction("com.diewish.app.WELLNESS_REMINDER")
            .setData(Uri.parse("diewish://wellness-reminder/" + Uri.encode(id)))
            .putExtra("reminderId", id)
            .putExtra("reminderType", type)
            .putExtra("reminderAt", at);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
