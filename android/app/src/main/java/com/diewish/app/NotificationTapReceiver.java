package com.diewish.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles notification open/dismiss actions and preserves allowlisted navigation. */
public final class NotificationTapReceiver extends BroadcastReceiver {
    private static final String ACTION_OPEN = "com.diewish.app.OPEN_NOTIFICATION";
    private static final String ACTION_DISMISS = "com.diewish.app.DISMISS_NOTIFICATION";
    private static final String EXTRA_TARGET = "notification_target";
    private static final String EXTRA_NOTIFICATION_ID = "notification_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID);
        DiewishNotificationUnreadStore.markRead(
            context.getApplicationContext(),
            notificationId
        );

        if (ACTION_DISMISS.equals(action)) return;
        if (!ACTION_OPEN.equals(action)) return;

        String target = NotificationRoutes.sanitizeTarget(intent.getStringExtra(EXTRA_TARGET));
        DiewishNotificationTargetStore.save(context.getApplicationContext(), target);

        Intent launch = new Intent(context, MainActivity.class)
            .setAction(ACTION_OPEN)
            .addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
        context.startActivity(launch);
    }

    public static PendingIntent pendingIntent(
        Context context,
        int requestCode,
        String target,
        String notificationId
    ) {
        Intent intent = new Intent(context, NotificationTapReceiver.class)
            .setAction(ACTION_OPEN)
            .putExtra(EXTRA_TARGET, NotificationRoutes.sanitizeTarget(target))
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    public static PendingIntent dismissPendingIntent(
        Context context,
        int requestCode,
        String notificationId
    ) {
        Intent intent = new Intent(context, NotificationTapReceiver.class)
            .setAction(ACTION_DISMISS)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        return PendingIntent.getBroadcast(
            context,
            requestCode ^ 0x4D57,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
