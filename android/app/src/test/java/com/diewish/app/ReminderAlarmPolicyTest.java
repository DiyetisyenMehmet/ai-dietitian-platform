package com.diewish.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ReminderAlarmPolicyTest {
    @Test
    public void preAndroid12UsesExactWithoutSpecialAccess() {
        assertTrue(ReminderAlarmPolicy.shouldUseExact(30, false));
    }

    @Test
    public void android12PlusRequiresExactAlarmCapability() {
        assertFalse(ReminderAlarmPolicy.shouldUseExact(31, false));
        assertTrue(ReminderAlarmPolicy.shouldUseExact(31, true));
        assertFalse(ReminderAlarmPolicy.shouldUseExact(36, false));
        assertTrue(ReminderAlarmPolicy.shouldUseExact(36, true));
    }
}
