package com.diewish.app;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.lang.reflect.Field;
import java.net.*;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.*;

/** Real Android shell + actual local React build. All account API replies are synthetic. */
@RunWith(AndroidJUnit4.class)
public final class LaunchVisualTest {
    private static final String FIXTURE = "https://10.0.2.2:3021";
    private SSLSocketFactory fixtureTls;
    private WebView web;
    private MainActivity activity;

    @Test public void lightLaunch() throws Exception { run("light"); }
    @Test public void darkLaunch() throws Exception { run("dark"); }

    private void run(String theme) throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        try (var descriptor = instrumentation.getUiAutomation().executeShellCommand(
            "cmd uimode night " + (theme.equals("dark") ? "yes" : "no"))) {
            new FileInputStream(descriptor.getFileDescriptor()).readAllBytes();
        }
        // Trust only this job's public fixture certificate. Default hostname
        // verification stays enabled; target-app TLS/security settings are untouched.
        var assets = instrumentation.getContext().getAssets();
        var cert = CertificateFactory.getInstance("X.509").generateCertificate(assets.open("launch-fixture.pem"));
        KeyStore keys = KeyStore.getInstance(KeyStore.getDefaultType());
        keys.load(null); keys.setCertificateEntry("ci-fixture", cert);
        var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trust.init(keys);
        SSLContext tls = SSLContext.getInstance("TLS");
        tls.init(null, trust.getTrustManagers(), null); fixtureTls = tls.getSocketFactory();
        readFixture("/__reset");
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(host -> {
                activity = host;
                try { web = (WebView) field("webView").get(host); }
                catch (Exception error) { throw new AssertionError(error); }
                WebViewClient original = web.getWebViewClient();
                web.setWebViewClient(new WebViewClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                        Uri uri = req.getUrl();
                        // No request reaches staging, production, Google or a real account.
                        if (!"https".equals(uri.getScheme()) || !"staging.diewish.com".equals(uri.getHost()))
                            return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Map.of(), new ByteArrayInputStream(new byte[0]));
                        try {
                            HttpsURLConnection connection = connect(uri.getEncodedPath() + (uri.getEncodedQuery() == null ? "" : "?" + uri.getEncodedQuery()));
                            int code = connection.getResponseCode();
                            String mime = connection.getContentType();
                            InputStream input = code < 400 ? connection.getInputStream() : connection.getErrorStream();
                            byte[] bytes = input == null ? new byte[0] : input.readAllBytes();
                            Map<String, String> headers = new HashMap<>();
                            connection.getHeaderFields().forEach((key, values) -> {
                                if (key != null) headers.put(key, String.join(", ", values));
                            });
                            connection.disconnect();
                            return new WebResourceResponse(mime == null ? "application/octet-stream" : mime.split(";")[0], "UTF-8", code, code < 400 ? "OK" : "Unauthorized", headers, new ByteArrayInputStream(bytes));
                        } catch (Exception error) { throw new AssertionError("Local fixture failed", error); }
                    }
                    @Override public void onPageStarted(WebView v, String url, Bitmap icon) { original.onPageStarted(v, url, icon); }
                    @Override public void onPageFinished(WebView v, String url) { original.onPageFinished(v, url); }
                    @Override public void onReceivedError(WebView v, WebResourceRequest r, android.webkit.WebResourceError e) { original.onReceivedError(v, r, e); }
                    @Override public void onReceivedSslError(WebView v, android.webkit.SslErrorHandler h, android.net.http.SslError e) { original.onReceivedSslError(v, h, e); }
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return original.shouldOverrideUrlLoading(v, r); }
                });
            });
            assertNotNull(field("launchCover").get(activity));
            screenshot(theme + "-native-cover");
            scenario.onActivity(host -> web.loadUrl(BuildConfig.WEB_BASE_URL + "/dashboard"));
            await("document.querySelector('[data-artwork-state=ready]') !== null");
            await("document.querySelector('[data-testid=diewish-brand-splash]') !== null");
            assertNotNull("Keep one native composition while guest routing is unresolved", field("launchCover").get(activity));
            String loading = evaluate(bounds());
            screenshot(theme + "-waiting");
            readFixture("/__release");
            await("location.pathname === '/login' && document.querySelector('[data-artwork-state=ready]') !== null");
            long deadline = System.currentTimeMillis() + 10000;
            while (field("launchCover").get(activity) != null && System.currentTimeMillis() < deadline) Thread.sleep(50);
            assertNull("Native cover must release on the final application frame", field("launchCover").get(activity));
            assertEquals("Lockup must stay in the same position through guest routing", loading, evaluate(bounds()));
            await("document.body.innerText.includes('Google ile devam et') && document.body.innerText.includes('Telefon numarası ile devam et')");
            await("document.getAnimations().every(a => a.playState === 'finished')");
            assertEquals("true", evaluate("innerWidth >= 390 && innerWidth <= 430"));
            screenshot(theme + "-login");
        }
    }

    private String bounds() {
        return "JSON.stringify((function(){var r=document.querySelector('img[alt=Diewish]').getBoundingClientRect();return [r.x,r.y,r.width,r.height,document.documentElement.scrollWidth<=innerWidth];})())";
    }
    private Field field(String name) throws Exception { Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true); return f; }
    private HttpsURLConnection connect(String path) throws Exception {
        HttpsURLConnection c = (HttpsURLConnection) new URL(FIXTURE + path).openConnection(Proxy.NO_PROXY);
        c.setSSLSocketFactory(fixtureTls); c.setConnectTimeout(10000); c.setReadTimeout(45000); return c;
    }
    private void readFixture(String path) throws Exception { var c = connect(path); c.getInputStream().close(); c.disconnect(); }
    private String evaluate(String source) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(source, value::set));
        long deadline = System.currentTimeMillis() + 5000;
        while (value.get() == null && System.currentTimeMillis() < deadline) Thread.sleep(25);
        assertNotNull(value.get()); return value.get();
    }
    private void await(String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < deadline) { if ("true".equals(evaluate(expression))) return; Thread.sleep(50); }
        fail("Missing launch presentation: " + expression);
    }
    private void screenshot(String name) throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        instrumentation.waitForIdleSync();
        File folder = new File(instrumentation.getTargetContext().getExternalFilesDir(null), "launch-evidence");
        assertTrue(folder.isDirectory() || folder.mkdirs());
        try (FileOutputStream out = new FileOutputStream(new File(folder, name + ".png"))) {
            assertTrue(instrumentation.getUiAutomation().takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, out));
        }
    }
}
