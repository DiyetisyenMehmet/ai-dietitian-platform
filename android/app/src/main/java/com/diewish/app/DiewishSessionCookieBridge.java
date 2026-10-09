package com.diewish.app;

import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import java.util.function.BooleanSupplier;

/** A write-only persistence signal. Cookie material stays inside WebView. */
public final class DiewishSessionCookieBridge {
    private final BooleanSupplier trustedPage;

    public DiewishSessionCookieBridge(BooleanSupplier trustedPage) {
        this.trustedPage = trustedPage;
    }

    @JavascriptInterface
    public void persist() {
        if (!trustedPage.getAsBoolean()) return;
        // JavascriptInterface runs on JavaBridge's thread, not the UI thread.
        // Keep this synchronous so fetch completion checkpoints Set-Cookie
        // before publishing auth state; no timer or shutdown callback is needed.
        try {
            CookieManager.getInstance().flush();
        } catch (RuntimeException ignored) {
            // Never expose cookie values or turn a persistence failure into auth.
        }
    }

    /**
     * Observes only successful first-party cookie-mutating fetches. Install at
     * document start so even the first hydration refresh is observed. The
     * page-finished call is idempotent and checkpoints any existing cookie.
     * This never reads headers, bodies, credentials or cookie material.
     */
    static String bootstrapScript() {
        return """
            (function () {
                function persist() {
                    try { window.DiewishSessionCookies.persist(); } catch (_) {}
                }
                if (!window.__diewishSessionCookieFetch && typeof window.fetch === 'function') {
                    var originalFetch = window.fetch;
                    var paths = [
                        '/api/auth/login', '/api/auth/register',
                        '/api/auth/refresh-token', '/api/auth/logout',
                        '/api/identity/external', '/api/identity/guest',
                        '/api/identity/guest/convert', '/api/identity/reactivate',
                        '/api/identity/deactivate'
                    ];
                    window.fetch = function (input, init) {
                        var checkpoint = false;
                        try {
                            var url = new URL(input && input.url || input, window.location.href);
                            var method = init && init.method || input && input.method || 'GET';
                            checkpoint = url.origin === window.location.origin
                                && method.toUpperCase() === 'POST'
                                && paths.indexOf(url.pathname) !== -1;
                        } catch (_) {}
                        return originalFetch.apply(this, arguments).then(function (response) {
                            if (checkpoint && response.ok) persist();
                            return response;
                        });
                    };
                    window.__diewishSessionCookieFetch = true;
                }
                persist();
            })();
            """;
    }
}
