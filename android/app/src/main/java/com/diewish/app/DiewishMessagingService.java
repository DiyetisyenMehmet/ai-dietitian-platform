package com.diewish.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.Set;

/** Receives data-only Diewish FCM messages without exposing tokens or payloads in logs. */
public final class DiewishMessagingService extends FirebaseMessagingService {
    public static final String EXTRA_DIEWISH_PATH = "diewish_path";
    private static final String CHANNEL_ID = "diewish_remote_updates";
    private static final String PREFS = "diewish_push_delivery";
    private static final String LAST_ID = "last_notification_id";
    private static final Set<String> ALLOWED_PATHS = Set.of(
        "/dashboard", "/ai", "/insights", "/goals"
    );

    @Override
    public void onNewToken(String token) {
        DiewishPushTokenStore.save(getApplicationContext(), token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String id = clean(data.get("notificationId"), 120);
        String title = clean(data.get("title"), 120);
        String body = clean(data.get("body"), 500);
        String path = allowedPath(data.get("path"));
        if (id.isEmpty() || title.isEmpty() || body.isEmpty()) return;
        if (alreadyShown(id)) return;
        if (!canPostNotifications()) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Diewish bildirimleri",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Diewish hesap bildirimleri ve koç güncellemeleri");
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class)
            .putExtra(EXTRA_DIEWISH_PATH, path)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();
        manager.notify(id.hashCode(), notification);
        remember(id);
    }

    private boolean canPostNotifications() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean alreadyShown(String id) {
        return id.equals(getSharedPreferences(PREFS, MODE_PRIVATE).getString(LAST_ID, ""));
    }

    private void remember(String id) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(LAST_ID, id).apply();
    }

    private static String allowedPath(String value) {
        return value != null && ALLOWED_PATHS.contains(value) ? value : "/dashboard";
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
