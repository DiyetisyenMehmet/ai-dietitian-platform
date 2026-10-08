package com.diewish.app;

/** Platform mapping only. Account preferences contain logical names, not device limits. */
public final class NotificationAlertPolicy {
    public static final String[] CATEGORIES = {"meals", "water", "activity", "sleep", "weekly", "coach"};
    public static final String[] SOUNDS = {"silent", "system", "diewish_drop", "diewish_gentle"};
    public static final String[] VIBRATIONS = {"off", "short", "double_short", "long", "short_long"};
    private NotificationAlertPolicy() {}
    public static boolean contains(String[] values, String value) {
        for (String candidate : values) if (candidate.equals(value)) return true;
        return false;
    }
    public static String sound(String value) { return contains(SOUNDS, value) ? value : "system"; }
    public static String vibration(String value) { return contains(VIBRATIONS, value) ? value : "off"; }
    public static String remoteCategory(String type) {
        if ("WEEKLY_REVIEW".equals(type) || "MONTHLY_REVIEW".equals(type)) return "weekly";
        if ("WATER_REMINDER".equals(type)) return "water";
        return "coach";
    }
    public static String channelId(String category, String sound, String vibration) {
        if (!contains(CATEGORIES, category)) throw new IllegalArgumentException("Invalid category");
        return "diewish_alert_v1_" + category + "_" + sound(sound) + "_" + vibration(vibration);
    }
    public static long[] pattern(String value) {
        switch (vibration(value)) {
            case "short": return new long[] {0, 160};
            case "double_short": return new long[] {0, 120, 100, 120};
            case "long": return new long[] {0, 450};
            case "short_long": return new long[] {0, 120, 100, 450};
            default: return new long[0];
        }
    }
    public static String categoryLabel(String category) {
        switch (category) {
            case "meals": return "Öğün hatırlatmaları";
            case "water": return "Su hatırlatmaları";
            case "activity": return "Aktivite hatırlatmaları";
            case "sleep": return "Uyku hazırlığı";
            case "weekly": return "Haftalık özet";
            default: return "Diewish Koç";
        }
    }
}
