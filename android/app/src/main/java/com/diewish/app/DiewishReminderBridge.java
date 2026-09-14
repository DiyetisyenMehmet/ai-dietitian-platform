package com.diewish.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONException;

import java.util.function.BooleanSupplier;

/** Narrow trusted-origin bridge for scheduling local, privacy-minimal reminders. */
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
    public String permissionStatus() {
        if (!trustedPage.getAsBoolean()) return "unavailable";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted";
        return activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED ? "granted" : "denied";
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
        return WellnessReminderReceiver.show(activity.getApplicationContext(), "test", "wellness-test");
    }
}
