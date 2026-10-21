package com.diewish.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebView;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadows.ShadowWebView;
import org.robolectric.util.ReflectionHelpers;
import java.util.Map;

/** Native resource/lifecycle evidence; not a substitute for a device recording. */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = {28, 33}, application = Application.class,
    instrumentedPackages = {"androidx.webkit"},
    shadows = {SessionCookiePersistenceTest.DocumentStartFeature.class, LaunchPresentationTest.VisualWebView.class})
public final class LaunchPresentationTest {
    @Implements(WebView.class)
    public static class VisualWebView extends ShadowWebView {
        static WebView.VisualStateCallback pending;
        static String artworkReady;
        @Implementation @Override protected void evaluateJavascript(String script, android.webkit.ValueCallback<String> result) {
            if (result != null && script.contains("data-artwork-state")) result.onReceiveValue(artworkReady);
            else super.evaluateJavascript(script, result);
        }
        @Implementation protected void postVisualStateCallback(long id, WebView.VisualStateCallback callback) {
            pending = callback;
        }
    }

    @Before public void reset() {
        SessionCookiePersistenceTest.DocumentStartFeature.supported = false;
        SessionCookiePersistenceTest.DocumentStartFeature.messagesSupported = false;
        VisualWebView.pending = null;
        VisualWebView.artworkReady = "true";
    }

    @Test public void coverRemainsUntilWebFrameReadyAndNeverReturnsOnLaterNavigation() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            MainActivity activity = host.get();
            WebView view = ReflectionHelpers.getField(activity, "webView");
            View cover = ReflectionHelpers.getField(activity, "launchCover");
            assertNotNull(cover);
            assertNotNull(cover.getBackground());
            assertEquals(BuildConfig.WEB_BASE_URL + "/dashboard", shadowOf(view).getLastLoadedUrl());
            var client = shadowOf(view).getWebViewClient();
            client.onPageFinished(view, BuildConfig.WEB_BASE_URL + "/dashboard");
            activity.new SystemUiBridge().onLaunchFrameReady();
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertSame(cover, ReflectionHelpers.getField(activity, "launchCover"));
            assertNotNull(VisualWebView.pending);
            VisualWebView.pending.onComplete(0);
            assertNull(cover.getParent());
            assertNull(ReflectionHelpers.getField(activity, "launchCover"));
            client.onPageStarted(view, BuildConfig.WEB_BASE_URL + "/login", null);
            assertNull(ReflectionHelpers.getField(activity, "launchCover"));
        } finally { host.pause().stop().destroy(); }
    }

    @Test public void initialBlankFinishCannotRemoveTheNativeComposition() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            MainActivity activity = host.get();
            WebView view = ReflectionHelpers.getField(activity, "webView");
            shadowOf(view).getWebViewClient().onPageFinished(view, "about:blank");
            assertNull(VisualWebView.pending);
            assertNotNull(ReflectionHelpers.getField(activity, "launchCover"));
        } finally { host.pause().stop().destroy(); }
    }

    @Test public void pageFinishedDoesNotRevealAnUndecodedModernHeader() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            MainActivity activity = host.get();
            WebView view = ReflectionHelpers.getField(activity, "webView");
            VisualWebView.artworkReady = "false";
            shadowOf(view).getWebViewClient().onPageFinished(view, BuildConfig.WEB_BASE_URL + "/dashboard");
            assertNull(VisualWebView.pending);
            assertNotNull(ReflectionHelpers.getField(activity, "launchCover"));
            VisualWebView.artworkReady = "true";
            activity.new SystemUiBridge().onLaunchFrameReady();
            shadowOf(android.os.Looper.getMainLooper()).idle();
            VisualWebView.pending.onComplete(0);
            assertNull(ReflectionHelpers.getField(activity, "launchCover"));
        } finally { host.pause().stop().destroy(); }
    }

    @Test public void readySignalOnlyReleasesAVisualFrameOnTheTrustedPage() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            MainActivity activity = host.get();
            WebView view = ReflectionHelpers.getField(activity, "webView");
            var client = shadowOf(view).getWebViewClient();
            client.onPageStarted(view, "https://untrusted.example/", null);
            activity.new SystemUiBridge().onLaunchFrameReady();
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertNull(VisualWebView.pending);
            assertNotNull(ReflectionHelpers.getField(activity, "launchCover"));
            client.onPageStarted(view, BuildConfig.WEB_BASE_URL + "/dashboard", null);
            activity.new SystemUiBridge().onLaunchFrameReady();
            shadowOf(android.os.Looper.getMainLooper()).idle();
            assertNotNull(VisualWebView.pending);
            assertNotNull(ReflectionHelpers.getField(activity, "launchCover"));
            VisualWebView.pending.onComplete(0);
            assertNull(ReflectionHelpers.getField(activity, "launchCover"));
        } finally { host.pause().stop().destroy(); }
    }

    @Test public void onlyMainFrameFailureDismissesCover() {
        var host = Robolectric.buildActivity(MainActivity.class).setup();
        try {
            MainActivity activity = host.get();
            WebView view = ReflectionHelpers.getField(activity, "webView");
            var client = shadowOf(view).getWebViewClient();
            client.onReceivedError(view, request(false), error());
            assertNotNull(ReflectionHelpers.getField(activity, "launchCover"));
            client.onReceivedError(view, request(true), error());
            assertNull(ReflectionHelpers.getField(activity, "launchCover"));
        } finally { host.pause().stop().destroy(); }
    }

    @Test public void splashArtworkHasTransparentCornersAndKeepsOpaqueInterior() {
        var resources = org.robolectric.RuntimeEnvironment.getApplication().getResources();
        Bitmap bitmap = BitmapFactory.decodeResource(resources, R.drawable.diewish_splash_rounded);
        assertTrue(bitmap.hasAlpha());
        assertEquals(0, Color.alpha(bitmap.getPixel(0, 0)));
        assertEquals(0, Color.alpha(bitmap.getPixel(bitmap.getWidth() - 1, bitmap.getHeight() - 1)));
        assertEquals(255, Color.alpha(bitmap.getPixel(bitmap.getWidth() / 2, bitmap.getHeight() / 2)));
        assertNotNull(resources.getDrawable(R.drawable.diewish_launch_background, null));
    }

    @Test @Config(qualifiers = "night") public void darkLaunchUsesTheExistingDarkSurface() {
        var resources = org.robolectric.RuntimeEnvironment.getApplication().getResources();
        assertEquals(Color.rgb(15, 20, 18), resources.getColor(R.color.diewish_launch_background, null));
    }

    private WebResourceError error() { return new android.webkit.LaunchTestWebResourceError(); }

    private WebResourceRequest request(boolean mainFrame) {
        return new WebResourceRequest() {
            public Uri getUrl() { return Uri.parse(BuildConfig.WEB_BASE_URL + "/synthetic"); }
            public boolean isForMainFrame() { return mainFrame; }
            public boolean isRedirect() { return false; }
            public boolean hasGesture() { return false; }
            public String getMethod() { return "GET"; }
            public Map<String, String> getRequestHeaders() { return java.util.Collections.emptyMap(); }
        };
    }
}
