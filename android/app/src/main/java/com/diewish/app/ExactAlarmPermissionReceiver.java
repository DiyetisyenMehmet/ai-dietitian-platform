package com.diewish.app;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Rebuilds persisted reminder alarms when exact-alarm access becomes available. */
public final class ExactAlarmPermissionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (!AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(
            intent.getAction()
        )) return;

        NutritionReminderScheduler.rescheduleStored(context);
        WellnessReminderScheduler.rescheduleStored(context);
    }
}
