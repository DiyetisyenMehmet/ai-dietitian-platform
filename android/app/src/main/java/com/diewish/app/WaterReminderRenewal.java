package com.diewish.app;

import java.util.Calendar;
import java.util.TimeZone;

/** Advances one existing water seed by local calendar weeks, without catch-up alerts. */
public final class WaterReminderRenewal {
    private WaterReminderRenewal() {}

    public static long nextAt(long due, long now, TimeZone zone) {
        if (due <= 0 || now < 0 || zone == null) return 0;
        Calendar next = Calendar.getInstance(zone);
        next.setTimeInMillis(due);
        // Bounded recovery covers 100 years of downtime; malformed data fails closed.
        for (int week = 0; week <= 5200; week++) {
            if (next.getTimeInMillis() > now) return next.getTimeInMillis();
            next.add(Calendar.DATE, 7);
        }
        return 0;
    }
}
