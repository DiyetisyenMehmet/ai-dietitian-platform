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

/** Delivers a privacy-minimal local reminder for a scheduled meal-plan time. */
public final class NutritionReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "nutrition_plan_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Öğün hatırlatmaları",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Diewish öğün planı saat hatırlatmaları");
            manager.createNotificationChannel(channel);
        }

        Intent openApp = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
        Notification notification = builder
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Diewish")
            .setContentText("Öğün saatin geldi. Planını kontrol edebilirsin.")
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .build();

        String id = intent.getStringExtra("reminderId");
        manager.notify(id == null ? 41 : id.hashCode(), notification);
    }
}
