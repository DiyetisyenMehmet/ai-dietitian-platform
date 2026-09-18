package com.diewish.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.os.Build;

/** Central policy for reliable user-selected reminder times. */
public final class ReminderAlarmPolicy {
    private ReminderAlarmPolicy() {}

    static boolean shouldUseExact(int sdkInt, boolean canScheduleExact) {
        return sdkInt < Build.VERSION_CODES.S || canScheduleExact;
    }

    public static String status(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return "unavailable";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "granted";
        return alarms.canScheduleExactAlarms() ? "granted" : "required";
    }

    public static boolean schedule(
        AlarmManager alarms,
        long triggerAtMillis,
        PendingIntent pendingIntent
    ) {
        boolean canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || alarms.canScheduleExactAlarms();

        if (shouldUseExact(Build.VERSION.SDK_INT, canExact)) {
            try {
                alarms.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
                );
                return true;
            } catch (SecurityException ignored) {
                // Access can be revoked between the check and scheduling call.
            }
        }

        alarms.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            triggerAtMillis,
            pendingIntent
        );
        return false;
    }
}
