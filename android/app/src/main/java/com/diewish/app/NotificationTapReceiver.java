package com.diewish.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Stores an allowlisted notification target before launching or resuming the app. */
public final class NotificationTapReceiver extends BroadcastReceiver {
    private static final String ACTION = "com.diewish.app.OPEN_NOTIFICATION";
    private static final String EXTRA_TARGET = "notification_target";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION.equals(intent.getAction())) return;
        String target = NotificationRoutes.sanitizeTarget(intent.getStringExtra(EXTRA_TARGET));
        DiewishNotificationTargetStore.save(context.getApplicationContext(), target);

        Intent launch = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(launch);
    }

    public static PendingIntent pendingIntent(
        Context context,
        int requestCode,
        String target
    ) {
        Intent intent = new Intent(context, NotificationTapReceiver.class)
            .setAction(ACTION)
            .putExtra(EXTRA_TARGET, NotificationRoutes.sanitizeTarget(target));
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
