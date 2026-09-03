# JavascriptInterface methods are invoked by the trusted Diewish WebView page.
-keepclassmembers class com.diewish.app.MainActivity$BillingBridge {
    @android.webkit.JavascriptInterface <methods>;
}
