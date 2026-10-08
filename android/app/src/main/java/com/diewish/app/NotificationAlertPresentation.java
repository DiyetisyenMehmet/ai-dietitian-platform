package com.diewish.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Vibrator;
import android.provider.Settings;
import org.json.JSONObject;
import java.util.Arrays;

/** One presentation adapter for existing local queues, remote pushes and ephemeral previews. */
public final class NotificationAlertPresentation {
    private static MediaPlayer player;
    private NotificationAlertPresentation() {}
    public static boolean hasVibration(Context context) {
        Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        return vibrator != null && vibrator.hasVibrator();
    }
    public static Uri soundUri(Context context, String sound) {
        switch (NotificationAlertPolicy.sound(sound)) {
            case "silent": return null;
            case "diewish_drop": return Uri.parse("android.resource://" + context.getPackageName() + "/raw/diewish_drop");
            case "diewish_gentle": return Uri.parse("android.resource://" + context.getPackageName() + "/raw/diewish_gentle");
            default: return Settings.System.DEFAULT_NOTIFICATION_URI;
        }
    }
    public static NotificationChannel channel(Context context, String category, JSONObject preference) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !NotificationAlertPolicy.contains(NotificationAlertPolicy.CATEGORIES, category)) return null;
        String sound = NotificationAlertPolicy.sound(preference.optString("soundPreset"));
        String vibration = NotificationAlertPolicy.vibration(preference.optString("vibrationPreset"));
        String group = "diewish_alert_" + category;
        manager.createNotificationChannelGroup(new NotificationChannelGroup(group, NotificationAlertPolicy.categoryLabel(category)));
        NotificationChannel channel = new NotificationChannel(NotificationAlertPolicy.channelId(category, sound, vibration), NotificationAlertPolicy.categoryLabel(category), NotificationManager.IMPORTANCE_DEFAULT);
        channel.setGroup(group);
        channel.setDescription("Diewish hesabındaki ses ve titreşim tercihi. Cihaz ayarları önceliklidir.");
        channel.setSound(soundUri(context, sound), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        boolean vibrate = !"off".equals(vibration) && hasVibration(context);
        channel.enableVibration(vibrate);
        if (vibrate) channel.setVibrationPattern(NotificationAlertPolicy.pattern(vibration));
        // At most 6 categories x 4 sounds x 5 patterns, created on demand.
        // Never delete/recreate channels to defeat system settings.
        manager.createNotificationChannel(channel);
        return manager.getNotificationChannel(channel.getId());
    }
    public static boolean canPost(Context context, NotificationChannel channel, String legacyId) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled() || channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationChannel legacy = legacyId == null ? null : manager.getNotificationChannel(legacyId);
        NotificationChannelGroup group = Build.VERSION.SDK_INT < 28 || channel.getGroup() == null ? null : manager.getNotificationChannelGroup(channel.getGroup());
        return (legacy == null || legacy.getImportance() != NotificationManager.IMPORTANCE_NONE) && (Build.VERSION.SDK_INT < 28 || group == null || !group.isBlocked());
    }
    public static String preview(Context context, String category, String raw) {
        if (!"staging".equals(BuildConfig.APP_ENVIRONMENT)) return "unavailable";
        if (!NotificationAlertPolicy.contains(NotificationAlertPolicy.CATEGORIES, category) || raw == null || raw.length() > 512) return "unsupported";
        try {
            JSONObject preference = NotificationAlertStore.preference(new JSONObject(raw));
            if (!"off".equals(preference.optString("vibrationPreset")) && !hasVibration(context)) return "vibration_unavailable";
            NotificationChannel channel = channel(context, category, preference);
            String legacy = "meals".equals(category) ? "nutrition_plan_reminders" : ("weekly".equals(category) || "coach".equals(category)) ? "diewish_remote_updates" : "wellness_reminders";
            if (!canPost(context, channel, legacy)) return "permission_denied";
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.notify("diewish-preview", category.hashCode(), new Notification.Builder(context, channel.getId())
                .setSmallIcon(R.drawable.ic_notification).setContentTitle("Diewish · Test bildirimi")
                .setContentText(NotificationAlertPolicy.categoryLabel(category) + " için cihaz önizlemesi.")
                .setAutoCancel(true).setTimeoutAfter(15000).build());
            // No schedule, inbox, unread count, remote provider or persisted preference writes.
            Uri wantedSound = soundUri(context, preference.optString("soundPreset"));
            boolean sameSound = wantedSound == null ? channel.getSound() == null : wantedSound.equals(channel.getSound());
            boolean wantedVibration = !"off".equals(preference.optString("vibrationPreset"));
            boolean sameVibration = channel.shouldVibrate() == wantedVibration && (!wantedVibration || Arrays.equals(channel.getVibrationPattern(), NotificationAlertPolicy.pattern(preference.optString("vibrationPreset"))));
            return sameSound && sameVibration && channel.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT && manager.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL ? "posted" : "posted_with_overrides";
        } catch (Exception ignored) { return "unavailable"; }
    }
    public static synchronized boolean previewSound(Context context, String preset) {
        if (!NotificationAlertPolicy.contains(NotificationAlertPolicy.SOUNDS, preset) || "silent".equals(preset)) return false;
        try {
            if (player != null) { player.release(); player = null; }
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
            player.setDataSource(context, soundUri(context, preset));
            player.setOnCompletionListener(value -> { synchronized (NotificationAlertPresentation.class) { value.release(); if (player == value) player = null; } });
            player.prepare();
            player.start();
            return true;
        } catch (Exception ignored) { if (player != null) { player.release(); player = null; } return false; }
    }
}
