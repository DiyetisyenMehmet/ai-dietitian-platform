package com.diewish.app;

import static org.junit.Assert.*;
import java.util.Calendar;
import java.util.TimeZone;
import org.junit.Test;

public final class WaterReminderRenewalTest {
    private long at(TimeZone zone, int month, int day, int hour) {
        Calendar c = Calendar.getInstance(zone);
        c.clear(); c.set(2026, month, day, hour, 15);
        return c.getTimeInMillis();
    }
    @Test public void renewalSkipsMissedWeeksWithoutCatchUpAndKeepsWeekday() {
        TimeZone z = TimeZone.getTimeZone("Europe/Istanbul");
        long due = at(z, Calendar.OCTOBER, 5, 9);
        long now = at(z, Calendar.NOVEMBER, 1, 10);
        long next = WaterReminderRenewal.nextAt(due, now, z);
        assertEquals(at(z, Calendar.NOVEMBER, 2, 9), next);
        assertTrue(next > now);
        assertEquals(next, WaterReminderRenewal.nextAt(next, now, z));
    }
    @Test public void calendarRenewalPreservesLocalHourAcrossSpringAndAutumnDst() {
        TimeZone z = TimeZone.getTimeZone("America/New_York");
        long spring = at(z, Calendar.MARCH, 1, 9);
        long springNext = WaterReminderRenewal.nextAt(spring, spring, z);
        assertEquals(at(z, Calendar.MARCH, 8, 9), springNext);
        assertEquals(167L * 3600000, springNext - spring);
        long autumn = at(z, Calendar.OCTOBER, 25, 9);
        assertEquals(169L * 3600000, WaterReminderRenewal.nextAt(autumn, autumn, z) - autumn);
    }
    @Test public void malformedTimeAndExcessiveRecoveryFailClosed() {
        TimeZone z = TimeZone.getTimeZone("UTC");
        assertEquals(0, WaterReminderRenewal.nextAt(0, 100, z));
        assertEquals(0, WaterReminderRenewal.nextAt(100, -1, z));
        assertEquals(0, WaterReminderRenewal.nextAt(100, Long.MAX_VALUE / 2, z));
    }
}
