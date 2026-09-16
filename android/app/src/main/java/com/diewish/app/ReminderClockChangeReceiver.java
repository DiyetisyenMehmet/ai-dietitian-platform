package com.diewish.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Prevents absolute local alarms from firing at stale wall-clock times. */
public final class ReminderClockChangeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_TIMEZONE_CHANGED.equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action)) return;

        // Preferences remain server-side. The authenticated app shell rebuilds
        // wellness reminders on the next start/focus; nutrition-plan reminders
        // are rebuilt when the current plan is next synchronized.
        WellnessReminderScheduler.cancelAll(context.getApplicationContext());
        NutritionReminderScheduler.cancelAll(context.getApplicationContext());
    }
}
