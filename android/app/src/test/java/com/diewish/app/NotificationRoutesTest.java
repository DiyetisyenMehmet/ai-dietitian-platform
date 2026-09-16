package com.diewish.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class NotificationRoutesTest {
    @Test
    public void knownRemoteTypesMapToRepositoryRoutes() {
        assertEquals(NotificationRoutes.AI_COACH, NotificationRoutes.forRemoteType("PROACTIVE_MESSAGE"));
        assertEquals(NotificationRoutes.INSIGHTS, NotificationRoutes.forRemoteType("WEEKLY_REVIEW"));
        assertEquals(NotificationRoutes.INSIGHTS, NotificationRoutes.forRemoteType("MONTHLY_REVIEW"));
        assertEquals(NotificationRoutes.INSIGHTS, NotificationRoutes.forRemoteType("RISK_ALERT"));
        assertEquals(NotificationRoutes.GOALS, NotificationRoutes.forRemoteType("GOAL_REMINDER"));
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.forRemoteType("WATER_REMINDER"));
    }

    @Test
    public void unknownOrMalformedTargetsFallBackToDashboard() {
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.forRemoteType("UNKNOWN"));
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.forRemoteType(null));
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.sanitizeTarget("https://evil.invalid"));
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.sanitizeTarget("/admin"));
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.sanitizeTarget(null));
    }

    @Test
    public void localReminderTypesUseOnlyAllowlistedRoutes() {
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.forWellnessType("water"));
        assertEquals(NotificationRoutes.ACTIVITY, NotificationRoutes.forWellnessType("activity"));
        assertEquals(NotificationRoutes.SLEEP, NotificationRoutes.forWellnessType("sleep"));
        assertEquals(NotificationRoutes.INSIGHTS, NotificationRoutes.forWellnessType("weekly"));
        assertEquals(NotificationRoutes.DASHBOARD, NotificationRoutes.forWellnessType("unexpected"));
        assertEquals(NotificationRoutes.MEALS, NotificationRoutes.sanitizeTarget(NotificationRoutes.MEALS));
        assertEquals(NotificationRoutes.BLOOD_TESTS, NotificationRoutes.sanitizeTarget(NotificationRoutes.BLOOD_TESTS));
    }
}
