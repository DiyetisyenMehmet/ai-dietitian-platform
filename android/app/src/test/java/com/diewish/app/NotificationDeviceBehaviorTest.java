package com.diewish.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Vibrator;
import java.time.Duration;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class, instrumentedPackages = {"com.diewish.app"})
public final class NotificationDeviceBehaviorTest {
    private Application app;
    private NotificationManager manager;
    private AlarmManager alarms;
    @Before public void before() {
        app = RuntimeEnvironment.getApplication();
        manager = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        shadowOf(manager).setNotificationsEnabled(true);
        shadowOf((Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE)).setHasVibrator(true);
    }
    private JSONObject row(String id, String type, long at, boolean recurring) throws Exception {
        JSONObject row = new JSONObject().put("id", id).put("type", type).put("at", at);
        if (recurring) row.put("repeatDays", 7);
        return row;
    }
    private JSONArray stored() throws Exception {
        return new JSONArray(app.getSharedPreferences("diewish_wellness_reminders", 0).getString("schedule", "[]"));
    }
    @Test public void everyNativeSoundAndVibrationMapsToActualChannelAndBoundedCatalog() throws Exception {
        for (String category : NotificationAlertPolicy.CATEGORIES) for (String sound : NotificationAlertPolicy.SOUNDS) for (String vibration : NotificationAlertPolicy.VIBRATIONS) {
            JSONObject preference = new JSONObject().put("soundPreset", sound).put("vibrationPreset", vibration);
            NotificationChannel channel = NotificationAlertPresentation.channel(app, category, preference);
            assertEquals(NotificationAlertPresentation.soundUri(app, sound), channel.getSound());
            assertEquals(!"off".equals(vibration), channel.shouldVibrate());
            if (!"off".equals(vibration)) assertArrayEquals(NotificationAlertPolicy.pattern(vibration), channel.getVibrationPattern());
        }
        assertEquals(120, manager.getNotificationChannels().size());
    }
    @Test public void allCategoryPreviewsUseSelectedNativeChannelWithoutHistoryOrQueueWrites() throws Exception {
        String snapshot = stored().toString();
        JSONObject pref = new JSONObject().put("soundPreset", "diewish_drop").put("vibrationPreset", "double_short");
        for (String category : NotificationAlertPolicy.CATEGORIES) {
            assertTrue(NotificationAlertPresentation.preview(app, category, pref.toString()).startsWith("posted"));
            Notification n = shadowOf(manager).getNotification("diewish-preview", category.hashCode());
            assertNotNull(n);
            assertEquals(NotificationAlertPolicy.channelId(category, "diewish_drop", "double_short"), n.getChannelId());
            assertEquals(15000L, n.getTimeoutAfter());
        }
        assertEquals(snapshot, stored().toString());
        assertEquals(0, shadowOf(alarms).getScheduledAlarms().size());
        assertEquals("[]", DiewishNotificationInboxStore.json(app));
        assertEquals(0, DiewishNotificationUnreadStore.count(app));
    }
    @Test public void deniedAndRevokedPermissionCannotReportSuccessfulPreview() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertEquals("permission_denied", NotificationAlertPresentation.preview(app, "water", "{}"));
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        shadowOf(manager).setNotificationsEnabled(false);
        assertEquals("permission_denied", NotificationAlertPresentation.preview(app, "water", "{}"));
        assertEquals(0, shadowOf(manager).getAllNotifications().size());
    }
    @Test public void blockedLegacyChannelIsRespectedByNewPreviewChannels() {
        manager.createNotificationChannel(new NotificationChannel("wellness_reminders", "Existing", NotificationManager.IMPORTANCE_NONE));
        assertEquals("permission_denied", NotificationAlertPresentation.preview(app, "water", "{}"));
    }
    @Test public void missingVibratorFailsExplicitlyAndSavedCategoryPreferenceSurvivesFailedPreview() throws Exception {
        assertTrue(NotificationAlertStore.replace(app, "{\"water\":{\"soundPreset\":\"silent\",\"vibrationPreset\":\"short\"}}"));
        String old = NotificationAlertStore.get(app, "water").toString();
        shadowOf((Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE)).setHasVibrator(false);
        assertEquals("vibration_unavailable", NotificationAlertPresentation.preview(app, "water", old));
        assertEquals(old, NotificationAlertStore.get(app, "water").toString());
    }
    @Test public void waterRenewsBeyondSevenDaysAndRejectsDuplicateOrCancelledBroadcasts() throws Exception {
        long due = ShadowSystemClock.currentTimeMillis() + 60000;
        WellnessReminderScheduler.replace(app, new JSONArray().put(row("seed", "water", due, true)).toString());
        ShadowSystemClock.advanceBy(Duration.ofMinutes(2));
        assertTrue(WellnessReminderScheduler.consume(app, "seed", "water", due));
        long next = stored().getJSONObject(0).getLong("at");
        assertTrue(next > ShadowSystemClock.currentTimeMillis());
        assertFalse(WellnessReminderScheduler.consume(app, "seed", "water", due));
        ShadowSystemClock.advanceBy(Duration.ofDays(8));
        WellnessReminderScheduler.rescheduleStored(app);
        assertTrue(stored().getJSONObject(0).getLong("at") > ShadowSystemClock.currentTimeMillis());
        WellnessReminderScheduler.cancelAll(app);
        assertFalse(WellnessReminderScheduler.consume(app, "seed", "water", next));
        assertEquals(0, shadowOf(alarms).getScheduledAlarms().size());
    }
    @Test public void rebootRecoversExpiredWaterButDoesNotReplayExpiredActivityOrSleep() throws Exception {
        long due = ShadowSystemClock.currentTimeMillis() + 60000;
        WellnessReminderScheduler.replace(app, new JSONArray().put(row("water", "water", due, true)).put(row("activity", "activity", due, false)).put(row("sleep", "sleep", due, false)).toString());
        ShadowSystemClock.advanceBy(Duration.ofDays(22));
        new NutritionReminderBootReceiver().onReceive(app, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(1, stored().length());
        assertEquals("water", stored().getJSONObject(0).getString("type"));
        assertTrue(stored().getJSONObject(0).getLong("at") > ShadowSystemClock.currentTimeMillis());
        assertEquals(0, shadowOf(manager).getAllNotifications().size());
    }
    @Test public void deniedPermissionStillRenewsWaterWithoutDisplayingAlert() throws Exception {
        long due = ShadowSystemClock.currentTimeMillis() + 60000;
        WellnessReminderScheduler.replace(app, new JSONArray().put(row("seed", "water", due, true)).toString());
        ShadowSystemClock.advanceBy(Duration.ofMinutes(2));
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        new WellnessReminderReceiver().onReceive(app, new Intent().putExtra("reminderId", "seed").putExtra("reminderType", "water").putExtra("reminderAt", due));
        assertTrue(stored().getJSONObject(0).getLong("at") > ShadowSystemClock.currentTimeMillis());
        assertEquals(0, shadowOf(manager).getAllNotifications().size());
    }
    @Test public void wellnessLimitFailureAndCategoryOperationsPreserveNutritionQueue() throws Exception {
        long due = ShadowSystemClock.currentTimeMillis() + 60000;
        NutritionReminderScheduler.replace(app, "[{\"id\":\"meal\",\"at\":" + due + "}]");
        String nutrition = app.getSharedPreferences("diewish_nutrition_reminders", 0).getString("schedule", "");
        WellnessReminderScheduler.replace(app, new JSONArray().put(row("keep", "water", due, true)).toString());
        String valid = stored().toString();
        JSONArray oversized = new JSONArray();
        for (int i = 0; i < 129; i++) oversized.put(row("id" + i, "water", due, true));
        assertThrows(org.json.JSONException.class, () -> WellnessReminderScheduler.replace(app, oversized.toString()));
        assertEquals(valid, stored().toString());
        WellnessReminderScheduler.cancelAll(app);
        assertEquals(nutrition, app.getSharedPreferences("diewish_nutrition_reminders", 0).getString("schedule", ""));
        assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
    }
    @Test public void scheduledTestAlsoLeavesNoPersistentHistoryOrReminderQueue() {
        assertTrue(WellnessReminderScheduler.scheduleTest(app, 60));
        new WellnessReminderReceiver().onReceive(app, new Intent().putExtra("reminderType", "test").putExtra("reminderId", "manual-test"));
        assertEquals("[]", DiewishNotificationInboxStore.json(app));
        assertEquals(0, DiewishNotificationUnreadStore.count(app));
        assertNull(app.getSharedPreferences("diewish_wellness_reminders", 0).getString("schedule", null));
    }
    @Test public void permissionIsDeviceScopedAndNeverAskedIsDistinctFromDenied() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        DiewishReminderBridge bridge = new DiewishReminderBridge(activity, () -> true);
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertEquals("default", bridge.permissionStatus());
        app.getSharedPreferences("diewish_notification_device", 0).edit().putBoolean("permission_requested", true).commit();
        assertEquals("denied", bridge.permissionStatus());
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertEquals("granted", bridge.permissionStatus());
        shadowOf(manager).setNotificationsEnabled(false);
        assertEquals("denied", bridge.permissionStatus());
        assertEquals("unavailable", new DiewishReminderBridge(activity, () -> false).permissionStatus());
    }
    @Test public void repeatedScheduledTestsAreBoundedAndCancelledAtLogout() {
        assertTrue(WellnessReminderScheduler.scheduleTest(app, 60));
        assertTrue(WellnessReminderScheduler.scheduleTest(app, 120));
        assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
        WellnessReminderScheduler.cancelAll(app);
        assertEquals(0, shadowOf(alarms).getScheduledAlarms().size());
    }
    @Test public void replacingNutritionPlanAndEnforcing240NeverRemovesWellnessAlarms() throws Exception {
        long due = ShadowSystemClock.currentTimeMillis() + 60000;
        WellnessReminderScheduler.replace(app, new JSONArray()
            .put(row("water", "water", due, true))
            .put(row("activity", "activity", due, false))
            .put(row("sleep", "sleep", due, false)).toString());
        String wellness = stored().toString();
        JSONArray meals = new JSONArray();
        for (int i = 0; i < 245; i++) meals.put(new JSONObject().put("id", "old-plan:" + i).put("at", due + i * 60000L));
        assertEquals(240, NutritionReminderScheduler.replace(app, meals.toString()));
        assertEquals(243, shadowOf(alarms).getScheduledAlarms().size());
        assertEquals(wellness, stored().toString());
        assertEquals(1, NutritionReminderScheduler.replace(app,
            new JSONArray().put(new JSONObject().put("id", "new-plan:0").put("at", due)).toString()));
        assertEquals(4, shadowOf(alarms).getScheduledAlarms().size());
        String nutrition = app.getSharedPreferences("diewish_nutrition_reminders", 0).getString("schedule", "");
        assertFalse(nutrition.contains("old-plan:"));
        assertTrue(nutrition.contains("new-plan:0"));
        assertEquals(wellness, stored().toString());
        NutritionReminderScheduler.cancelAll(app);
        assertEquals(3, shadowOf(alarms).getScheduledAlarms().size());
        assertEquals(wellness, stored().toString());
    }
}
