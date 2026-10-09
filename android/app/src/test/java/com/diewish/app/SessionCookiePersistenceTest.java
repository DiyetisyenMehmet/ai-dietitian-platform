package com.diewish.app;

import static org.junit.Assert.*;
import android.app.Application;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.RoboCookieManager;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Robolectric;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.util.ReflectionHelpers;
import static org.robolectric.Shadows.shadowOf;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.ScriptHandler;
import java.util.Set;
import java.util.ArrayList;
import java.util.List;
import android.webkit.ValueCallback;
import org.robolectric.shadows.ShadowWebView;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadows.ShadowCookieManager;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class,
    instrumentedPackages = {"androidx.webkit"},
    shadows = {SessionCookiePersistenceTest.DurableCookieManager.class,
        SessionCookiePersistenceTest.DocumentStartFeature.class,
        SessionCookiePersistenceTest.DocumentStartScripts.class,
        SessionCookiePersistenceTest.ScriptEvaluations.class})
public final class SessionCookiePersistenceTest {
    // A persistence boundary model, not real WebView/Emulator cookie evidence.
    @Implements(CookieManager.class)
    public static class DurableCookieManager extends ShadowCookieManager {
        static String memory;
        static String disk;
        static int flushes;
        static boolean fail;
        static CookieManager manager;
        @Implementation protected static CookieManager getInstance() { return manager; }
        static void processDeathWithoutLifecycle() { memory = disk; }
    }

    public static class TrackingCookies extends RoboCookieManager {
        @Override public void flush() {
            if (DurableCookieManager.fail) throw new IllegalStateException("Synthetic IO failure");
            DurableCookieManager.disk = DurableCookieManager.memory;
            DurableCookieManager.flushes++;
        }
    }

    @Implements(value = WebViewFeature.class, isInAndroidSdk = false)
    public static class DocumentStartFeature {
        static boolean supported;
        @Implementation public static boolean isFeatureSupported(String feature) { return supported; }
    }

    @Implements(value = WebViewCompat.class, isInAndroidSdk = false)
    public static class DocumentStartScripts {
        static int registrations;
        static String script;
        static Set<String> origins;
        @Implementation public static ScriptHandler addDocumentStartJavaScript(WebView view, String source, Set<String> allowed) {
            assertNull(shadowOf(view).getLastLoadedUrl()); // registration precedes first load
            registrations++;
            script = source;
            origins = allowed;
            return null;
        }
    }

    @Implements(WebView.class)
    public static class ScriptEvaluations extends ShadowWebView {
        static final List<String> scripts = new ArrayList<>();
        @Implementation @Override protected void evaluateJavascript(String source, ValueCallback<String> callback) {
            scripts.add(source);
            super.evaluateJavascript(source, callback);
        }
    }

    @Before public void reset() {
        DurableCookieManager.memory = null;
        DurableCookieManager.disk = null;
        DurableCookieManager.flushes = 0;
        DurableCookieManager.fail = false;
        DurableCookieManager.manager = new TrackingCookies();
        DocumentStartFeature.supported = true;
        DocumentStartScripts.registrations = 0;
        ScriptEvaluations.scripts.clear();
    }

    @Test public void lateLoginCookieSurvivesKillWithoutLifecycleCallbacks() {
        CookieManager.getInstance().flush(); // page finished before login response
        DurableCookieManager.memory = "synthetic-login-cookie";
        new DiewishSessionCookieBridge(() -> true).persist();
        DurableCookieManager.processDeathWithoutLifecycle();
        assertEquals("synthetic-login-cookie", DurableCookieManager.memory);
        assertEquals(2, DurableCookieManager.flushes);
    }

    @Test public void rotatedSuccessorSurvivesNewHostAndCookieDeletionSurvivesLogout() {
        DiewishSessionCookieBridge host = new DiewishSessionCookieBridge(() -> true);
        DurableCookieManager.memory = "synthetic-first";
        host.persist();
        DurableCookieManager.memory = "synthetic-successor";
        host.persist();
        DurableCookieManager.processDeathWithoutLifecycle();
        assertEquals("synthetic-successor", DurableCookieManager.memory);
        DiewishSessionCookieBridge recreatedHost = new DiewishSessionCookieBridge(() -> true);
        DurableCookieManager.memory = null; // server clear-cookie already processed
        recreatedHost.persist();
        DurableCookieManager.processDeathWithoutLifecycle();
        assertNull(DurableCookieManager.memory);
    }

    @Test public void trustIsCheckedOnEverySignalAndUntrustedPagesCannotFlush() {
        AtomicBoolean trusted = new AtomicBoolean(false);
        DiewishSessionCookieBridge host = new DiewishSessionCookieBridge(trusted::get);
        host.persist();
        assertEquals(0, DurableCookieManager.flushes);
        trusted.set(true);
        host.persist();
        assertEquals(1, DurableCookieManager.flushes);
        trusted.set(false);
        host.persist();
        assertEquals(1, DurableCookieManager.flushes);
    }

    @Test public void optionalPersistenceFailureDoesNotExposeCookieOrThrowIntoJS() {
        DurableCookieManager.fail = true;
        new DiewishSessionCookieBridge(() -> true).persist();
        assertNull(DurableCookieManager.disk);
        assertEquals(0, DurableCookieManager.flushes);
    }

    @Test public void onlyExportedMethodHasNoArgumentsAndReturnsNoCredential() {
        int exported = 0;
        for (Method method : DiewishSessionCookieBridge.class.getDeclaredMethods()) {
            if (method.getAnnotation(JavascriptInterface.class) == null) continue;
            exported++;
            assertEquals("persist", method.getName());
            assertEquals(0, method.getParameterCount());
            assertEquals(void.class, method.getReturnType());
        }
        assertEquals(1, exported);
    }

    @Test public void hostRegistersBridgeBeforeLoadKeepsCookiePolicyAndRecreatesWebView() {
        ActivityController<MainActivity> first = Robolectric.buildActivity(MainActivity.class).setup();
        WebView firstView = ReflectionHelpers.getField(first.get(), "webView");
        assertEquals(BuildConfig.WEB_BASE_URL + "/dashboard", shadowOf(firstView).getLastLoadedUrl());
        Object bridge = shadowOf(firstView).getJavascriptInterface("DiewishSessionCookies");
        assertTrue(bridge instanceof DiewishSessionCookieBridge);
        assertEquals(1, DocumentStartScripts.registrations);
        assertEquals(java.util.Collections.singleton(BuildConfig.WEB_BASE_URL), DocumentStartScripts.origins);
        assertEquals(DiewishSessionCookieBridge.bootstrapScript(), DocumentStartScripts.script);
        assertTrue(CookieManager.getInstance().acceptCookie());
        assertFalse(CookieManager.getInstance().acceptThirdPartyCookies(firstView));
        DurableCookieManager.memory = "synthetic-host-cookie";
        ((DiewishSessionCookieBridge) bridge).persist();
        first.pause().stop().destroy();
        assertNull(shadowOf(firstView).getJavascriptInterface("DiewishSessionCookies"));
        assertTrue(shadowOf(firstView).wasDestroyCalled());
        ActivityController<MainActivity> next = Robolectric.buildActivity(MainActivity.class).setup();
        WebView nextView = ReflectionHelpers.getField(next.get(), "webView");
        assertNotSame(firstView, nextView);
        assertTrue(shadowOf(nextView).getJavascriptInterface("DiewishSessionCookies") instanceof DiewishSessionCookieBridge);
        assertEquals("synthetic-host-cookie", DurableCookieManager.disk);
        next.pause().stop().destroy();
    }

    @Test public void oldProviderKeepsSafePageFinishedFallbackAndNeverEnablesThirdPartyCookies() {
        DocumentStartFeature.supported = false;
        ActivityController<MainActivity> host = Robolectric.buildActivity(MainActivity.class).setup();
        WebView view = ReflectionHelpers.getField(host.get(), "webView");
        assertEquals(0, DocumentStartScripts.registrations);
        shadowOf(view).getWebViewClient().onPageFinished(view, BuildConfig.WEB_BASE_URL + "/dashboard");
        assertTrue(ScriptEvaluations.scripts.stream().anyMatch(source -> source.startsWith(DiewishSessionCookieBridge.bootstrapScript())));
        assertFalse(CookieManager.getInstance().acceptThirdPartyCookies(view));
        host.pause().stop().destroy();
    }
}
