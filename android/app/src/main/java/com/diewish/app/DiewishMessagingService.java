package com.diewish.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Receives data-only Diewish FCM messages without exposing tokens or payloads in logs. */
public final class DiewishMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "diewish_remote_updates";
    private static final String PREFS = "diewish_push_delivery";
    private static final String SHOWN_IDS = "shown_notification_ids";
    private static final int MAX_SHOWN_IDS = 64;

    @Override
    public void onNewToken(String token) {
        DiewishPushTokenStore.save(getApplicationContext(), token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String id = clean(data.get("notificationId"), 120);
        String type = clean(data.get("type"), 64);
        String title = clean(data.get("title"), 120);
        String body = clean(data.get("body"), 500);
        String path = NotificationRoutes.forRemoteType(type);
        if (id.isEmpty() || title.isEmpty() || body.isEmpty()) return;
        if (alreadyShown(id)) return;
        if (!canPostNotifications()) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Diewish bildirimleri",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Diewish hesap bildirimleri ve koç güncellemeleri");
            manager.createNotificationChannel(channel);
        }

        PendingIntent pendingIntent = NotificationTapReceiver.pendingIntent(
            this,
            id.hashCode(),
            path
        );
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
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
        return readShownIds().contains(id);
    }

    private List<String> readShownIds() {
        String raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString(SHOWN_IDS, "[]");
        List<String> ids = new ArrayList<>();
        try {
            JSONArray values = new JSONArray(raw);
            for (int index = 0; index < values.length(); index++) {
                String value = values.optString(index, "");
                if (!value.isEmpty()) ids.add(value);
            }
        } catch (JSONException ignored) {
            // Corrupt local dedupe state is non-fatal; the next write replaces it.
        }
        return ids;
    }

    private void remember(String id) {
        List<String> ids = readShownIds();
        ids.remove(id);
        ids.add(id);
        while (ids.size() > MAX_SHOWN_IDS) ids.remove(0);

        JSONArray values = new JSONArray();
        for (String value : ids) values.put(value);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(SHOWN_IDS, values.toString()).apply();
    }

    private static String clean(String value, int maxLength) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
