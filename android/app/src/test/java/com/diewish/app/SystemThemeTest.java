package com.diewish.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.UiModeManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadows.ShadowWebView;
import org.robolectric.util.ReflectionHelpers;

/** Configuration and bridge boundary tests; not physical WebView media-query evidence. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 33}, application = Application.class, instrumentedPackages = {"androidx.webkit"},
    shadows = {SessionCookiePersistenceTest.DocumentStartFeature.class,
        SystemThemeTest.ThemeWebView.class, SystemThemeTest.AppNightMode.class})
public final class SystemThemeTest {
    @Implements(WebView.class)
    public static class ThemeWebView extends ShadowWebView {
        static int loads;
        @Implementation @Override protected void loadUrl(String url) { loads++; super.loadUrl(url); }
    }
    @Implements(UiModeManager.class)
    public static class AppNightMode {
        static int lastMode;
        @Implementation protected void setApplicationNightMode(int mode) { lastMode = mode; }
    }
    @Before public void reset() {
        RuntimeEnvironment.getApplication().getSharedPreferences("diewish_presentation", 0).edit().clear().commit();
        SessionCookiePersistenceTest.DocumentStartFeature.supported = false;
        SessionCookiePersistenceTest.DocumentStartFeature.messagesSupported = false;
        ThemeWebView.loads = 0;
        AppNightMode.lastMode = -100;
    }
    private void assertSurface(MainActivity activity, boolean dark) {
        View root = ReflectionHelpers.getField(activity, "rootView");
        int expected = dark ? Color.rgb(15, 20, 18) : Color.WHITE;
        assertEquals(expected, ((ColorDrawable) root.getBackground()).getColor());
        WebView view = ReflectionHelpers.getField(activity, "webView");
        var bars = WindowCompat.getInsetsController(activity.getWindow(), view);
        assertEquals(!dark, bars.isAppearanceLightStatusBars());
        assertEquals(!dark, bars.isAppearanceLightNavigationBars());
    }
    @Test public void newInstallFollowsBothSystemThemes() {
        for (boolean dark : new boolean[] {false, true}) {
            RuntimeEnvironment.setQualifiers(dark ? "+night" : "+notnight");
            var host = Robolectric.buildActivity(MainActivity.class).setup();
            try {
                assertSurface(host.get(), dark);
                var attribute = host.get().getTheme().obtainStyledAttributes(new int[] {android.R.attr.isLightTheme});
                try { assertEquals(!dark, attribute.getBoolean(0, !dark)); } finally { attribute.recycle(); }
            } finally { host.pause().stop().destroy(); }
        }
    }
    @Test public void savedManualChoiceSurvivesOppositeSystemAndNewHost() {
        for (boolean dark : new boolean[] {false, true}) {
            RuntimeEnvironment.setQualifiers(dark ? "+notnight" : "+night");
            var first = Robolectric.buildActivity(MainActivity.class).setup();
            first.get().new SystemUiBridge().setThemePreference(dark ? "dark" : "light", dark);
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertSurface(first.get(), dark);
            if (android.os.Build.VERSION.SDK_INT >= 31) assertEquals(dark ? UiModeManager.MODE_NIGHT_YES : UiModeManager.MODE_NIGHT_NO, AppNightMode.lastMode);
            first.pause().stop().destroy();
            var next = Robolectric.buildActivity(MainActivity.class).setup();
            try { assertSurface(next.get(), dark); } finally { next.pause().stop().destroy(); }
        }
    }
    @Test public void returningToSystemClearsAppOverrideAndConfigurationDoesNotReloadWebView() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            var activity = host.get();
            WebView view = ReflectionHelpers.getField(activity, "webView");
            activity.new SystemUiBridge().setThemePreference("dark", true);
            activity.new SystemUiBridge().setThemePreference("system", false);
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertEquals("system", activity.getSharedPreferences("diewish_presentation", 0).getString("theme", "missing"));
            if (android.os.Build.VERSION.SDK_INT >= 31) assertEquals(UiModeManager.MODE_NIGHT_AUTO, AppNightMode.lastMode);
            int loads = ThemeWebView.loads;
            for (boolean dark : new boolean[] {true, false}) {
                Configuration config = new Configuration(activity.getResources().getConfiguration());
                config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
                host.configurationChange(config);
                assertSame(view, ReflectionHelpers.getField(host.get(), "webView"));
                assertEquals(loads, ThemeWebView.loads);
                assertSurface(host.get(), dark);
            }
        } finally { host.pause().stop().destroy(); }
    }
    @Test public void invalidOrUntrustedAppearanceSignalCannotChangePreferences() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            var activity = host.get();
            activity.new SystemUiBridge().setThemePreference("invalid", true);
            WebView view = ReflectionHelpers.getField(activity, "webView");
            shadowOf(view).getWebViewClient().onPageStarted(view, "https://untrusted.example/login", null);
            activity.new SystemUiBridge().setThemePreference("dark", true);
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertFalse(activity.getSharedPreferences("diewish_presentation", 0).contains("theme"));
        } finally { host.pause().stop().destroy(); }
    }
}
