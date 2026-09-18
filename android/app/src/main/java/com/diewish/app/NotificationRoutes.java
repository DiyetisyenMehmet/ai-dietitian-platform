package com.diewish.app;

import java.util.Set;

/** Explicit allowlist and type-to-route mapping for notification navigation. */
public final class NotificationRoutes {
    public static final String DASHBOARD = "/dashboard";
    public static final String AI_COACH = "/ai";
    public static final String INSIGHTS = "/insights";
    public static final String GOALS = "/goals";
    public static final String MEALS = "/meals";
    public static final String ACTIVITY = "/activity";
    public static final String SLEEP = "/sleep";
    public static final String PROGRESS = "/progress";
    public static final String BLOOD_TESTS = "/profile/blood-tests";
    public static final String NOTIFICATION_SETTINGS = "/profile/notifications";

    private static final Set<String> ALLOWED_TARGETS = Set.of(
        DASHBOARD,
        AI_COACH,
        INSIGHTS,
        GOALS,
        MEALS,
        ACTIVITY,
        SLEEP,
        PROGRESS,
        BLOOD_TESTS,
        NOTIFICATION_SETTINGS
    );

    private NotificationRoutes() {}

    public static String forRemoteType(String type) {
        if ("PROACTIVE_MESSAGE".equals(type)) return AI_COACH;
        if (
            "WEEKLY_REVIEW".equals(type)
                || "MONTHLY_REVIEW".equals(type)
                || "RISK_ALERT".equals(type)
        ) return INSIGHTS;
        if ("GOAL_REMINDER".equals(type)) return GOALS;
        if ("WATER_REMINDER".equals(type)) return DASHBOARD;
        return DASHBOARD;
    }

    public static String forWellnessType(String type) {
        if ("activity".equals(type)) return ACTIVITY;
        if ("sleep".equals(type)) return SLEEP;
        if ("weekly".equals(type)) return INSIGHTS;
        if ("test".equals(type)) return NOTIFICATION_SETTINGS;
        return DASHBOARD;
    }

    public static String sanitizeTarget(String path) {
        return path != null && ALLOWED_TARGETS.contains(path) ? path : DASHBOARD;
    }
}
