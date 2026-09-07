package com.diewish.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restores persisted local reminder alarms after a device reboot. */
public final class NutritionReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            NutritionReminderScheduler.rescheduleStored(context);
        }
    }
}
