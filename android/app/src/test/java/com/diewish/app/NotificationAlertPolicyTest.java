package com.diewish.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.HashSet;
import java.util.Set;

public class NotificationAlertPolicyTest {
    @Test public void channelsAreBoundedAndCategoryScoped() {
        Set<String> ids = new HashSet<>();
        for (String category : NotificationAlertPolicy.CATEGORIES)
            for (String sound : NotificationAlertPolicy.SOUNDS)
                for (String pattern : NotificationAlertPolicy.VIBRATIONS)
                    assertTrue(ids.add(NotificationAlertPolicy.channelId(category, sound, pattern)));
        assertEquals(120, ids.size());
        assertEquals(NotificationAlertPolicy.channelId("water", "system", "off"), NotificationAlertPolicy.channelId("water", "untrusted-file://sound", "999999"));
    }
    @Test public void vibrationPresetsMapToFiniteNonRepeatingPatterns() {
        assertArrayEquals(new long[0], NotificationAlertPolicy.pattern("off"));
        assertArrayEquals(new long[] {0, 160}, NotificationAlertPolicy.pattern("short"));
        assertArrayEquals(new long[] {0, 120, 100, 120}, NotificationAlertPolicy.pattern("double_short"));
        assertArrayEquals(new long[] {0, 450}, NotificationAlertPolicy.pattern("long"));
        assertArrayEquals(new long[] {0, 120, 100, 450}, NotificationAlertPolicy.pattern("short_long"));
        assertArrayEquals(new long[0], NotificationAlertPolicy.pattern("unsafe"));
    }
    @Test public void remoteCategoriesRetainTheirProductMeaning() {
        assertEquals("weekly", NotificationAlertPolicy.remoteCategory("WEEKLY_REVIEW"));
        assertEquals("weekly", NotificationAlertPolicy.remoteCategory("MONTHLY_REVIEW"));
        assertEquals("coach", NotificationAlertPolicy.remoteCategory("PROACTIVE_MESSAGE"));
        assertEquals("coach", NotificationAlertPolicy.remoteCategory("RISK_ALERT"));
        assertEquals("water", NotificationAlertPolicy.remoteCategory("WATER_REMINDER"));
    }
    @Test(expected = IllegalArgumentException.class) public void arbitraryCategoriesCannotCreateChannels() {
        NotificationAlertPolicy.channelId("malicious-category", "system", "off");
    }
}
