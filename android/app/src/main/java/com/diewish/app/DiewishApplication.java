package com.diewish.app;

import android.app.Application;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

/** Initializes local reminders and public Firebase Android client configuration. */
public final class DiewishApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();

        // Re-sanitize persisted wellness alarms on every app start. This removes
        // the legacy local weekly-summary alarm while preserving water/activity/sleep.
        WellnessReminderScheduler.rescheduleStored(this);

        if (!hasFirebaseConfig()) return;

        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .build();
            FirebaseApp.initializeApp(this, options);
        }
        refreshPushToken();
    }

    private boolean hasFirebaseConfig() {
        return !BuildConfig.FIREBASE_PROJECT_ID.isBlank()
            && !BuildConfig.FIREBASE_APP_ID.isBlank()
            && !BuildConfig.FIREBASE_API_KEY.isBlank()
            && !BuildConfig.FIREBASE_SENDER_ID.isBlank();
    }

    public void refreshPushToken() {
        if (FirebaseApp.getApps(this).isEmpty()) return;
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(
            token -> DiewishPushTokenStore.save(this, token)
        );
    }
}
