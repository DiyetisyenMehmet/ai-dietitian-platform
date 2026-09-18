package com.diewish.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONException;

import java.util.function.BooleanSupplier;

/** Narrow trusted-origin bridge for scheduling local reminders and syncing push registration. */
public final class DiewishReminderBridge {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4207;

    private final Activity activity;
    private final BooleanSupplier trustedPage;

    public DiewishReminderBridge(Activity activity, BooleanSupplier trustedPage) {
        this.activity = activity;
        this.trustedPage = trustedPage;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return trustedPage.getAsBoolean();
    }

    @JavascriptInterface
    public String appVersion() {
        return trustedPage.getAsBoolean() ? BuildConfig.VERSION_NAME : "";
    }

    @JavascriptInterface
    public String pushToken() {
        if (!trustedPage.getAsBoolean()) return "";
        return DiewishPushTokenStore.get(activity.getApplicationContext());
    }

    @JavascriptInterface
    public void ensurePushToken() {
        if (!trustedPage.getAsBoolean() || FirebaseApp.getApps(activity).isEmpty()) return;
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(
            token -> DiewishPushTokenStore.save(activity.getApplicationContext(), token)
        );
    }

    @JavascriptInterface
    public void deletePushToken() {
        if (!trustedPage.getAsBoolean()) return;
        DiewishPushTokenStore.clear(activity.getApplicationContext());
        if (FirebaseApp.getApps(activity).isEmpty()) return;
        FirebaseMessaging.getInstance().deleteToken();
    }

    @JavascriptInterface
    public String pendingNotificationPath() {
        if (!trustedPage.getAsBoolean()) return "";
        return DiewishNotificationTargetStore.get(activity.getApplicationContext());
    }

    @JavascriptInterface
    public void clearPendingNotificationPath() {
        if (!trustedPage.getAsBoolean()) return;
        DiewishNotificationTargetStore.clear(activity.getApplicationContext());
    }

    @JavascriptInterface
    public String permissionStatus() {
        if (!trustedPage.getAsBoolean()) return "unavailable";
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED
        ) return "denied";

        NotificationManager manager =
            (NotificationManager) activity.getSystemService(Activity.NOTIFICATION_SERVICE);
        if (manager == null) return "unavailable";
        return manager.areNotificationsEnabled() ? "granted" : "denied";
    }

    @JavascriptInterface
    public String exactAlarmStatus() {
        if (!trustedPage.getAsBoolean()) return "unavailable";
        return ReminderAlarmPolicy.status(activity.getApplicationContext());
    }

    @JavascriptInterface
    public void requestExactAlarmAccess() {
        if (!trustedPage.getAsBoolean() || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        if ("granted".equals(ReminderAlarmPolicy.status(activity.getApplicationContext()))) return;

        activity.runOnUiThread(() -> {
            Uri packageUri = Uri.parse("package:" + activity.getPackageName());
            Intent exactAlarmSettings = new Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                packageUri
            );
            try {
                activity.startActivity(exactAlarmSettings);
            } catch (ActivityNotFoundException ignored) {
                Intent appSettings = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    packageUri
                );
                activity.startActivity(appSettings);
            }
        });
    }

    @JavascriptInterface
    public void requestPermission() {
        if (!trustedPage.getAsBoolean() || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        activity.runOnUiThread(() -> activity.requestPermissions(
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            NOTIFICATION_PERMISSION_REQUEST
        ));
    }

    @JavascriptInterface
    public int replaceSchedule(String scheduleJson) {
        if (!trustedPage.getAsBoolean()) return 0;
        try {
            return NutritionReminderScheduler.replace(activity.getApplicationContext(), scheduleJson);
        } catch (JSONException | RuntimeException ignored) {
            return 0;
        }
    }

    @JavascriptInterface
    public void cancelAll() {
        if (!trustedPage.getAsBoolean()) return;
        NutritionReminderScheduler.cancelAll(activity.getApplicationContext());
        WellnessReminderScheduler.cancelAll(activity.getApplicationContext());
    }

    @JavascriptInterface
    public void cancelNutrition() {
        if (!trustedPage.getAsBoolean()) return;
        NutritionReminderScheduler.cancelAll(activity.getApplicationContext());
    }

    @JavascriptInterface
    public int replaceWellnessSchedule(String scheduleJson) {
        if (!trustedPage.getAsBoolean()) return 0;
        try {
            return WellnessReminderScheduler.replace(activity.getApplicationContext(), scheduleJson);
        } catch (JSONException | RuntimeException ignored) {
            return 0;
        }
    }

    @JavascriptInterface
    public void cancelWellness() {
        if (!trustedPage.getAsBoolean()) return;
        WellnessReminderScheduler.cancelAll(activity.getApplicationContext());
    }

    @JavascriptInterface
    public boolean showTestNotification() {
        if (!trustedPage.getAsBoolean()) return false;
        return WellnessReminderReceiver.show(
            activity.getApplicationContext(),
            "test",
            "wellness-test"
        );
    }

    @JavascriptInterface
    public boolean scheduleTestReminder(int delaySeconds) {
        if (!trustedPage.getAsBoolean()) return false;
        if (!"granted".equals(ReminderAlarmPolicy.status(activity.getApplicationContext()))) {
            return false;
        }
        return WellnessReminderScheduler.scheduleTest(
            activity.getApplicationContext(),
            delaySeconds
        );
    }
}
