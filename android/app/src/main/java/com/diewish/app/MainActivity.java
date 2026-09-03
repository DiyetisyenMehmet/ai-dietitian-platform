package com.diewish.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Diewish Android host.
 *
 * The existing responsive Diewish application remains the UI source of truth,
 * while security-sensitive Android capabilities are native. Google Play Billing
 * is never implemented in JavaScript: this Activity owns BillingClient and only
 * exposes a narrow bridge to the exact Diewish HTTPS origin.
 */
public final class MainActivity extends Activity implements PurchasesUpdatedListener {
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private static final String BILLING_BRIDGE = "DiewishBilling";

    private WebView webView;
    private BillingClient billingClient;
    private boolean billingReady = false;
    private ValueCallback<Uri[]> filePathCallback;
    private final Map<String, ProductDetails> productCache = new HashMap<>();
    private String trustedHost;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        trustedHost = URI.create(BuildConfig.WEB_BASE_URL).getHost();
        configureBilling();
        configureWebView();
        setContentView(webView);
        webView.loadUrl(BuildConfig.WEB_BASE_URL + "/dashboard");
    }

    private void configureBilling() {
        PendingPurchasesParams pending = PendingPurchasesParams.newBuilder()
            .enableOneTimeProducts()
            .build();

        billingClient = BillingClient.newBuilder(this)
            .setListener(this)
            .enablePendingPurchases(pending)
            .build();

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                billingReady = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                emitBillingStatus(result);
            }

            @Override
            public void onBillingServiceDisconnected() {
                billingReady = false;
                emitEvent("diewish:billing-status", jsonObject("ready", false));
            }
        });
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " DiewishAndroid/" + BuildConfig.VERSION_NAME);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new BillingBridge(), BILLING_BRIDGE);
        webView.setWebViewClient(new TrustedWebViewClient());
        webView.setWebChromeClient(new DiewishChromeClient());
    }

    private boolean isTrustedPage() {
        String current = webView == null ? null : webView.getUrl();
        if (current == null) return false;
        try {
            Uri uri = Uri.parse(current);
            return "https".equalsIgnoreCase(uri.getScheme()) && trustedHost.equalsIgnoreCase(uri.getHost());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void emitBillingStatus(BillingResult result) {
        JSONObject detail = new JSONObject();
        try {
            detail.put("ready", billingReady);
            detail.put("responseCode", result.getResponseCode());
        } catch (JSONException ignored) {
        }
        emitEvent("diewish:billing-status", detail);
    }

    private void emitEvent(String eventName, JSONObject detail) {
        if (webView == null || !isTrustedPage()) return;
        final String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName)
            + ", { detail: " + detail.toString() + " }));";
        runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private static JSONObject jsonObject(String key, Object value) {
        JSONObject object = new JSONObject();
        try {
            object.put(key, value);
        } catch (JSONException ignored) {
        }
        return object;
    }

    private JSONObject productToJson(ProductDetails product) throws JSONException {
        JSONObject item = new JSONObject();
        item.put("productId", product.getProductId());
        item.put("title", product.getTitle());
        item.put("description", product.getDescription());

        JSONArray offersJson = new JSONArray();
        List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
        if (offers != null) {
            for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                JSONObject offerJson = new JSONObject();
                offerJson.put("offerToken", offer.getOfferToken());
                offerJson.put("basePlanId", offer.getBasePlanId());
                offerJson.put("offerId", offer.getOfferId() == null ? JSONObject.NULL : offer.getOfferId());

                JSONArray phasesJson = new JSONArray();
                for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
                    JSONObject phaseJson = new JSONObject();
                    phaseJson.put("formattedPrice", phase.getFormattedPrice());
                    phaseJson.put("priceCurrencyCode", phase.getPriceCurrencyCode());
                    phaseJson.put("priceAmountMicros", phase.getPriceAmountMicros());
                    phaseJson.put("billingPeriod", phase.getBillingPeriod());
                    phaseJson.put("billingCycleCount", phase.getBillingCycleCount());
                    phaseJson.put("recurrenceMode", phase.getRecurrenceMode());
                    phasesJson.put(phaseJson);
                }
                offerJson.put("pricingPhases", phasesJson);
                offersJson.put(offerJson);
            }
        }
        item.put("offers", offersJson);
        return item;
    }

    private ProductDetails.SubscriptionOfferDetails preferredOffer(ProductDetails details, String requestedToken) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        if (requestedToken != null && !requestedToken.isEmpty()) {
            for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                if (requestedToken.equals(offer.getOfferToken())) return offer;
            }
        }
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (offer.getOfferId() == null) return offer;
        }
        return offers.get(0);
    }

    private void emitPurchases(String state, List<Purchase> purchases) {
        JSONObject detail = new JSONObject();
        JSONArray payload = new JSONArray();
        try {
            detail.put("state", state);
            for (Purchase purchase : purchases) {
                JSONObject row = new JSONObject();
                row.put("purchaseToken", purchase.getPurchaseToken());
                row.put("purchaseState", purchase.getPurchaseState());
                row.put("acknowledged", purchase.isAcknowledged());
                row.put("orderId", purchase.getOrderId() == null ? JSONObject.NULL : purchase.getOrderId());
                row.put("products", new JSONArray(purchase.getProducts()));
                payload.put(row);
            }
            detail.put("purchases", payload);
        } catch (JSONException ignored) {
        }
        emitEvent("diewish:billing-purchase", detail);
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            List<Purchase> purchased = new ArrayList<>();
            List<Purchase> pending = new ArrayList<>();
            for (Purchase purchase : purchases) {
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) purchased.add(purchase);
                else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) pending.add(purchase);
            }
            if (!purchased.isEmpty()) emitPurchases("PURCHASED", purchased);
            if (!pending.isEmpty()) emitPurchases("PENDING", pending);
            return;
        }

        JSONObject detail = new JSONObject();
        try {
            detail.put("state", code == BillingClient.BillingResponseCode.USER_CANCELED ? "CANCELED" : "ERROR");
            detail.put("responseCode", code);
        } catch (JSONException ignored) {
        }
        emitEvent("diewish:billing-purchase", detail);
    }

    public final class BillingBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return isTrustedPage() && billingReady;
        }

        @JavascriptInterface
        public String appVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void queryProducts(String productIdsJson) {
            if (!isTrustedPage()) return;
            if (!billingReady) {
                emitEvent("diewish:billing-products", jsonObject("error", "BILLING_UNAVAILABLE"));
                return;
            }

            try {
                JSONArray ids = new JSONArray(productIdsJson);
                List<QueryProductDetailsParams.Product> products = new ArrayList<>();
                for (int i = 0; i < ids.length() && i < 10; i++) {
                    String id = ids.optString(i, "").trim();
                    if (id.isEmpty()) continue;
                    products.add(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build());
                }
                if (products.isEmpty()) {
                    emitEvent("diewish:billing-products", jsonObject("error", "NO_PRODUCTS"));
                    return;
                }

                QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(products)
                    .build();

                billingClient.queryProductDetailsAsync(params, (result, queryResult) -> {
                    JSONObject detail = new JSONObject();
                    JSONArray items = new JSONArray();
                    try {
                        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            detail.put("error", "QUERY_FAILED");
                            detail.put("responseCode", result.getResponseCode());
                        } else {
                            productCache.clear();
                            for (ProductDetails product : queryResult.getProductDetailsList()) {
                                productCache.put(product.getProductId(), product);
                                items.put(productToJson(product));
                            }
                            detail.put("products", items);
                        }
                    } catch (JSONException ignored) {
                    }
                    emitEvent("diewish:billing-products", detail);
                });
            } catch (JSONException error) {
                emitEvent("diewish:billing-products", jsonObject("error", "INVALID_REQUEST"));
            }
        }

        @JavascriptInterface
        public void purchase(String productId, String offerToken, String obfuscatedAccountId) {
            if (!isTrustedPage() || !billingReady) return;
            if (obfuscatedAccountId == null || obfuscatedAccountId.length() != 64) {
                emitEvent("diewish:billing-purchase", jsonObject("state", "INVALID_ACCOUNT"));
                return;
            }

            ProductDetails details = productCache.get(productId);
            if (details == null) {
                emitEvent("diewish:billing-purchase", jsonObject("state", "PRODUCT_NOT_READY"));
                return;
            }
            ProductDetails.SubscriptionOfferDetails offer = preferredOffer(details, offerToken);
            if (offer == null) {
                emitEvent("diewish:billing-purchase", jsonObject("state", "OFFER_NOT_READY"));
                return;
            }

            BillingFlowParams.ProductDetailsParams productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .setOfferToken(offer.getOfferToken())
                .build();
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParams))
                .setObfuscatedAccountId(obfuscatedAccountId)
                .build();
            BillingResult result = billingClient.launchBillingFlow(MainActivity.this, flow);
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                JSONObject payload = jsonObject("state", "ERROR");
                try {
                    payload.put("responseCode", result.getResponseCode());
                } catch (JSONException ignored) {
                }
                emitEvent("diewish:billing-purchase", payload);
            }
        }

        @JavascriptInterface
        public void restorePurchases() {
            if (!isTrustedPage() || !billingReady) return;
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
            billingClient.queryPurchasesAsync(params, (result, purchases) -> {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    emitPurchases("RESTORED", purchases);
                } else {
                    emitEvent("diewish:billing-purchase", jsonObject("state", "RESTORE_FAILED"));
                }
            });
        }
    }

    private final class TrustedWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if ("https".equalsIgnoreCase(uri.getScheme()) && trustedHost.equalsIgnoreCase(uri.getHost())) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
            handler.cancel();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isTrustedPage()) {
                view.evaluateJavascript("window.__DIEWISH_ANDROID_APP__ = true;", null);
                emitEvent("diewish:billing-status", jsonObject("ready", billingReady));
            }
        }
    }

    private final class DiewishChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePath,
            FileChooserParams fileChooserParams
        ) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = filePath;
            try {
                Intent intent = fileChooserParams.createIntent();
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (ActivityNotFoundException error) {
                filePathCallback = null;
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (billingClient != null) billingClient.endConnection();
        if (webView != null) {
            webView.removeJavascriptInterface(BILLING_BRIDGE);
            webView.destroy();
        }
        super.onDestroy();
    }
}
