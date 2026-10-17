package com.diewish.app;

import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Application;
import android.net.Uri;
import android.os.CancellationSignal;
import android.util.Base64;
import android.webkit.WebView;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33, application = Application.class)
public final class GoogleAuthBridgeTest {
    private static final String ORIGIN = "https://staging.diewish.com";
    private static final String PROJECT = "isolated-staging-project";
    private static final String CLIENT = "123456-synthetic.apps.googleusercontent.com";
    private static final String ID = "synthetic-request-0001";
    private WebView view;
    private Activity activity;
    private DiewishGoogleAuthBridge bridge;
    private final List<String> replies = new ArrayList<>();
    private final List<DiewishGoogleAuthBridge.Result> callbacks = new ArrayList<>();
    private final List<CancellationSignal> signals = new ArrayList<>();
    private final List<String> nonces = new ArrayList<>();

    @Before public void setUp() {
        activity = Robolectric.buildActivity(Activity.class).setup().get();
        view = new WebView(activity);
        view.loadUrl(ORIGIN + "/login");
        bridge = create(PROJECT, CLIENT);
    }

    private DiewishGoogleAuthBridge create(String project, String client) {
        return new DiewishGoogleAuthBridge(activity, view, ORIGIN, project, client,
            (clientId, nonce, signal, result) -> {
                assertEquals(CLIENT, clientId);
                callbacks.add(result);
                signals.add(signal);
                nonces.add(nonce);
            });
    }

    private String message(String action, String id, String project) throws Exception {
        return new JSONObject().put("action", action).put("id", id).put("projectId", project).toString();
    }

    private void start(String id) throws Exception {
        bridge.receive(message("signIn", id, PROJECT), Uri.parse(ORIGIN), true, replies::add);
    }

    private String token(String audience, String nonce) throws Exception {
        String claims = new JSONObject().put("aud", audience).put("nonce", nonce).toString();
        return "synthetic." + Base64.encodeToString(claims.getBytes(StandardCharsets.UTF_8),
            Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING) + ".signature";
    }

    @Test public void selectedIdentityIsBoundToRequestAudienceAndNonce() throws Exception {
        start(ID);
        String selected = token(CLIENT, nonces.get(0));
        callbacks.get(0).success(selected);
        JSONObject response = new JSONObject(replies.get(0));
        assertEquals(ID, response.getString("id"));
        assertEquals(selected, response.getString("idToken"));
        callbacks.get(0).success(selected);
        assertEquals(1, replies.size()); // duplicate / replay callback cannot publish twice
    }

    @Test public void arbitraryOriginsPortsUserInfoAndAllSubframesAreRejected() throws Exception {
        for (String source : List.of("http://staging.diewish.com", "https://staging.diewish.com.attacker.test",
            "https://attacker.test", "https://staging.diewish.com:444", "https://user@staging.diewish.com")) {
            bridge.receive(message("signIn", ID, PROJECT), Uri.parse(source), true, replies::add);
        }
        bridge.receive(message("signIn", ID, PROJECT), Uri.parse(ORIGIN), false, replies::add);
        assertTrue(callbacks.isEmpty());
        assertTrue(replies.isEmpty());
    }

    @Test public void topLevelPageMustBeAnExactFirstPartyAuthPage() throws Exception {
        for (String page : List.of("https://attacker.test/login", ORIGIN + ":444/login",
            ORIGIN + "/dashboard", ORIGIN + "/admin/login", ORIGIN + "/login/extra")) {
            view.loadUrl(page);
            start(ID);
        }
        assertTrue(callbacks.isEmpty());
        view.loadUrl(ORIGIN + "/register");
        start(ID);
        assertEquals(1, callbacks.size());
    }

    @Test public void absentOrMismatchedProjectAndClientFailBeforeAccountSelection() throws Exception {
        bridge.receive(message("signIn", ID, "other-project"), Uri.parse(ORIGIN), true, replies::add);
        bridge = create("", CLIENT);
        start(ID);
        bridge = create(PROJECT, "invalid-client");
        start(ID);
        assertTrue(callbacks.isEmpty());
        for (String reply : replies) {
            assertEquals("auth/configuration-unavailable", new JSONObject(reply).getString("error"));
        }
        assertEquals(3, replies.size());
    }

    @Test public void malformedInputCannotStartSelectionOrLeakProviderDetails() throws Exception {
        for (String value : List.of("bad json", "{}", "null", "x".repeat(1025), message("unknown", ID, PROJECT),
            message("signIn", "bad", PROJECT))) {
            bridge.receive(value, Uri.parse(ORIGIN), true, replies::add);
        }
        assertTrue(callbacks.isEmpty());
        start(ID);
        callbacks.get(0).failure("private-provider-details");
        assertEquals("auth/native-failed", new JSONObject(replies.get(0)).getString("error"));
        assertFalse(replies.toString().contains("private-provider-details"));
    }

    @Test public void doubleClickCannotStartASecondAccountSelection() throws Exception {
        start(ID);
        start("synthetic-request-0002");
        assertEquals(1, callbacks.size());
        assertEquals("auth/cancelled-popup-request", new JSONObject(replies.get(0)).getString("error"));
    }

    @Test public void nonceMismatchWrongAudienceAndMalformedTokensAreRejected() throws Exception {
        for (String value : List.of(token(CLIENT, "wrong-nonce"), token("other-client", "wrong-nonce"),
            "invalid-token", "x".repeat(16385))) {
            start(ID);
            callbacks.get(callbacks.size() - 1).success(value);
            assertEquals("auth/invalid-credential", new JSONObject(replies.get(replies.size() - 1)).getString("error"));
            assertFalse(new JSONObject(replies.get(replies.size() - 1)).has("idToken"));
        }
    }

    @Test public void audienceAndNonceAreCheckedIndependentlyWithoutTrustingDecodedClaims() throws Exception {
        assertTrue(DiewishGoogleAuthBridge.matchesRequest(token(CLIENT, "expected"), CLIENT, "expected"));
        assertFalse(DiewishGoogleAuthBridge.matchesRequest(token("other-client", "expected"), CLIENT, "expected"));
        assertFalse(DiewishGoogleAuthBridge.matchesRequest(token(CLIENT, "other"), CLIENT, "expected"));
        assertFalse(DiewishGoogleAuthBridge.matchesRequest(null, CLIENT, "expected"));
    }

    @Test public void cancelAndRetryDropPreviousAccountAndUseFreshNonce() throws Exception {
        start(ID);
        bridge.receive(message("cancel", "synthetic-request-other", PROJECT), Uri.parse(ORIGIN), true, replies::add);
        assertFalse(signals.get(0).isCanceled());
        bridge.receive(message("cancel", ID, PROJECT), Uri.parse(ORIGIN), true, replies::add);
        assertTrue(signals.get(0).isCanceled());
        start("synthetic-request-0002");
        assertNotEquals(nonces.get(0), nonces.get(1));
        callbacks.get(0).success(token(CLIENT, nonces.get(0)));
        assertTrue(replies.isEmpty());
        String selected = token(CLIENT, nonces.get(1));
        callbacks.get(1).success(selected);
        assertEquals(selected, new JSONObject(replies.get(0)).getString("idToken"));
    }

    @Test public void navigationAndHostDestructionDiscardLateCredentials() throws Exception {
        start(ID);
        bridge.cancel(); // MainActivity.onPageStarted lifecycle boundary
        callbacks.get(0).success(token(CLIENT, nonces.get(0)));
        assertTrue(signals.get(0).isCanceled());
        assertTrue(replies.isEmpty());
        start("synthetic-request-0002");
        bridge.close();
        callbacks.get(1).success(token(CLIENT, nonces.get(1)));
        start("synthetic-request-0003");
        assertEquals(2, callbacks.size());
        assertTrue(replies.isEmpty());
    }

    @Test public void spaNavigationAwayFromLoginPreventsLateDelivery() throws Exception {
        start(ID);
        view.loadUrl(ORIGIN + "/dashboard");
        callbacks.get(0).success(token(CLIENT, nonces.get(0)));
        assertTrue(replies.isEmpty());
    }

    @Test public void userCancellationAllowsRetryAndDoesNotCreateNativeFirebaseSession() throws Exception {
        start(ID);
        callbacks.get(0).failure("auth/native-cancelled");
        assertEquals("auth/native-cancelled", new JSONObject(replies.get(0)).getString("error"));
        start("synthetic-request-0002");
        assertEquals(2, callbacks.size());
    }
}
