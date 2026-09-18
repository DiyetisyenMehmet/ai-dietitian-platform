package com.diewish.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Delivers generic reminder copy without health values or private content. */
public final class WellnessReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "wellness_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        show(
            context,
            intent == null ? null : intent.getStringExtra("reminderType"),
            intent == null ? null : intent.getStringExtra("reminderId")
        );
    }

    public static boolean show(Context context, String type, String id) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Sağlıklı yaşam hatırlatmaları", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Diewish su, aktivite, uyku ve haftalık özet hatırlatmaları");
            manager.createNotificationChannel(channel);
            NotificationChannel activeChannel = manager.getNotificationChannel(CHANNEL_ID);
            if (
                activeChannel != null
                    && activeChannel.getImportance() == NotificationManager.IMPORTANCE_NONE
            ) return false;
        }
        if (!manager.areNotificationsEnabled()) return false;

        String title;
        String body;
        if ("water".equals(type)) {
            title = "Su zamanı"; body = "Günlük su hedefin için küçük bir mola verebilirsin.";
        } else if ("activity".equals(type)) {
            title = "Hareket zamanı"; body = "Bugünkü hareket hedefin için kısa bir adım atabilirsin.";
        } else if ("sleep".equals(type)) {
            title = "Uyku hazırlığı"; body = "Dinlendirici bir gece için uyku rutinine hazırlanabilirsin.";
        } else if ("weekly".equals(type)) {
            title = "Haftalık özet"; body = "Bu haftaki ilerlemeni Diewish'te inceleyebilirsin.";
        } else {
            title = "Diewish bildirimi"; body = "Bildirimlerin başarıyla çalışıyor.";
        }

        int requestCode = id == null ? 73 : id.hashCode();
        String unreadId = "wellness:" + (id == null ? String.valueOf(requestCode) : id);
        PendingIntent contentIntent = NotificationTapReceiver.pendingIntent(
            context,
            requestCode,
            NotificationRoutes.forWellnessType(type),
            unreadId
        );
        PendingIntent dismissIntent = NotificationTapReceiver.dismissPendingIntent(
            context,
            requestCode,
            unreadId
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        Notification notification = builder
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentIntent)
            .setDeleteIntent(dismissIntent)
            .setAutoCancel(true)
            .build();
        manager.notify(requestCode, notification);
        DiewishNotificationUnreadStore.markUnread(context.getApplicationContext(), unreadId);
        return true;
    }
}
