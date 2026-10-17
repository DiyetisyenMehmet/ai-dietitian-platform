package com.diewish.app;

import android.app.Activity;
import android.net.Uri;
import android.os.CancellationSignal;
import android.util.Base64;
import android.webkit.WebView;

import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.function.Consumer;

/** Native account selection only. Firebase and Diewish still verify the identity on the web path. */
public final class DiewishGoogleAuthBridge {
    static final String NAME = "DiewishGoogleAuth";
    private final Activity activity;
    private final WebView view;
    private final String origin;
    private final String projectId;
    private final String webClientId;
    private final CredentialRequester requester;
    private Pending pending;
    private boolean installed;
    private boolean closed;

    interface Result {
        void success(String idToken);
        void failure(String code);
    }

    interface CredentialRequester {
        void request(String clientId, String nonce, CancellationSignal cancellation, Result result);
    }

    private static final class Pending {
        final String id;
        final String nonce;
        final Consumer<String> reply;
        final CancellationSignal cancellation = new CancellationSignal();
        Pending(String id, String nonce, Consumer<String> reply) {
            this.id = id;
            this.nonce = nonce;
            this.reply = reply;
        }
    }

    DiewishGoogleAuthBridge(Activity activity, WebView view) {
        this(activity, view, BuildConfig.WEB_BASE_URL, BuildConfig.FIREBASE_PROJECT_ID,
            BuildConfig.GOOGLE_WEB_CLIENT_ID, (clientId, nonce, cancellation, result) -> {
                GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId)
                    .setNonce(nonce).build();
                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .addCredentialOption(option).build();
                CredentialManager.create(activity).getCredentialAsync(activity, request, cancellation,
                    ContextCompat.getMainExecutor(activity),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse response) {
                            if (!(response.getCredential() instanceof CustomCredential credential)
                                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                result.failure("auth/invalid-credential");
                                return;
                            }
                            try {
                                result.success(GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken());
                            } catch (Exception ignored) {
                                result.failure("auth/invalid-credential");
                            }
                        }
                        @Override public void onError(GetCredentialException error) {
                            result.failure(error instanceof GetCredentialCancellationException
                                ? "auth/native-cancelled" : "auth/native-failed");
                        }
                    });
            });
    }

    // Injection point for deterministic tests without Google accounts or system UI.
    DiewishGoogleAuthBridge(Activity activity, WebView view, String origin, String projectId,
        String webClientId, CredentialRequester requester) {
        this.activity = activity;
        this.view = view;
        this.origin = origin;
        this.projectId = projectId;
        this.webClientId = webClientId;
        this.requester = requester;
    }

    void install() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        // Unlike addJavascriptInterface, this authenticates the calling frame's
        // origin. No iframe, wildcard origin, URL token or global JS event is used.
        WebViewCompat.addWebMessageListener(view, NAME, Collections.singleton(origin),
            (webView, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (message.getType() == androidx.webkit.WebMessageCompat.TYPE_STRING) {
                    receive(message.getData(), sourceOrigin, isMainFrame, replyProxy::postMessage);
                }
            });
        installed = true;
    }

    void receive(String data, Uri sourceOrigin, boolean isMainFrame, Consumer<String> reply) {
        if (closed || !isMainFrame || !isExactOrigin(sourceOrigin) || !isLoginPage()
            || data == null || data.length() > 1024) return;
        try {
            JSONObject message = new JSONObject(data);
            String id = message.optString("id");
            if (!id.matches("[A-Za-z0-9-]{16,64}")) return;
            String action = message.optString("action");
            if ("cancel".equals(action)) {
                if (pending != null && pending.id.equals(id)) cancel();
                return;
            }
            if (!"signIn".equals(action)) return;
            if (pending != null) {
                send(reply, id, null, "auth/cancelled-popup-request");
                return;
            }
            if (projectId.isBlank() || !projectId.equals(message.optString("projectId"))
                || !webClientId.matches("[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com")) {
                send(reply, id, null, "auth/configuration-unavailable");
                return;
            }
            byte[] bytes = new byte[32];
            new SecureRandom().nextBytes(bytes);
            Pending request = new Pending(id,
                Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), reply);
            pending = request;
            try {
                requester.request(webClientId, request.nonce, request.cancellation, new Result() {
                    @Override public void success(String token) {
                        if (!matchesRequest(token, webClientId, request.nonce)) {
                            finish(request, null, "auth/invalid-credential");
                            return;
                        }
                        finish(request, token, null);
                    }
                    @Override public void failure(String code) {
                        finish(request, null, "auth/native-cancelled".equals(code)
                            ? code : "auth/native-failed");
                    }
                });
            } catch (RuntimeException ignored) {
                finish(request, null, "auth/native-failed");
            }
        } catch (JSONException ignored) {
            // Invalid bridge input never starts authentication or enters logs.
        }
    }

    private boolean isExactOrigin(Uri uri) {
        Uri expected = Uri.parse(origin);
        return uri != null && "https".equals(uri.getScheme())
            && expected.getHost().equals(uri.getHost()) && uri.getUserInfo() == null
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private boolean isLoginPage() {
        Uri page = view.getUrl() == null ? null : Uri.parse(view.getUrl());
        return !activity.isFinishing() && !activity.isDestroyed() && isExactOrigin(page)
            && ("/login".equals(page.getPath()) || "/register".equals(page.getPath()));
    }

    private void finish(Pending request, String token, String error) {
        if (pending != request || closed) return;
        pending = null;
        if (isLoginPage()) send(request.reply, request.id, token, error);
    }

    private static void send(Consumer<String> reply, String id, String token, String error) {
        try {
            JSONObject response = new JSONObject().put("id", id);
            if (token != null) response.put("idToken", token);
            if (error != null) response.put("error", error);
            // ReplyProxy is tied to the originating JS document; navigation
            // cannot redirect a delayed credential into a replacement page.
            reply.accept(response.toString());
        } catch (JSONException | RuntimeException ignored) {
            // No token, provider exception, profile or session information is logged.
        }
    }

    // Request binding only: these claims do NOT replace cryptographic Firebase
    // validation or the existing backend's Firebase ID-token verification.
    static boolean matchesRequest(String token, String clientId, String nonce) {
        if (token == null || token.length() > 16_384) return false;
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) return false;
            JSONObject claims = new JSONObject(new String(
                Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP), StandardCharsets.UTF_8));
            return clientId.equals(claims.optString("aud")) && nonce.equals(claims.optString("nonce"));
        } catch (JSONException | IllegalArgumentException ignored) {
            return false;
        }
    }

    void cancel() {
        Pending previous = pending;
        pending = null;
        if (previous != null) previous.cancellation.cancel();
    }

    void close() {
        closed = true;
        cancel();
        if (installed) WebViewCompat.removeWebMessageListener(view, NAME);
    }
}
