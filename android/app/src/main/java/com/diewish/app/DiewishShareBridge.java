package com.diewish.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.function.BooleanSupplier;

/** Native Android share-sheet bridge exposed only while the WebView is on Diewish's trusted HTTPS origin. */
public final class DiewishShareBridge {
    private static final int MAX_BASE64_CHARS = 12_000_000;

    private final Activity activity;
    private final BooleanSupplier trustedPage;

    public DiewishShareBridge(Activity activity, BooleanSupplier trustedPage) {
        this.activity = activity;
        this.trustedPage = trustedPage;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return trustedPage.getAsBoolean();
    }

    @JavascriptInterface
    public void shareText(String text, String title) {
        if (!trustedPage.getAsBoolean() || text == null || text.isBlank()) return;
        Intent intent = new Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, text);
        if (title != null && !title.isBlank()) intent.putExtra(Intent.EXTRA_SUBJECT, title);
        launchChooser(intent, title);
    }

    @JavascriptInterface
    public void sharePng(String base64Png, String filename, String text) {
        if (!trustedPage.getAsBoolean() || base64Png == null || base64Png.isBlank()) return;
        if (base64Png.length() > MAX_BASE64_CHARS) return;

        final byte[] bytes;
        try {
            bytes = Base64.decode(base64Png, Base64.DEFAULT);
        } catch (IllegalArgumentException ignored) {
            return;
        }
        if (bytes.length == 0) return;

        String safeName = sanitizeFilename(filename);
        File directory = new File(activity.getCacheDir(), "shared");
        if (!directory.exists() && !directory.mkdirs()) return;
        File image = new File(directory, safeName);

        try (FileOutputStream output = new FileOutputStream(image, false)) {
            output.write(bytes);
        } catch (IOException ignored) {
            return;
        }

        Uri uri;
        try {
            uri = FileProvider.getUriForFile(
                activity,
                BuildConfig.APPLICATION_ID + ".fileprovider",
                image
            );
        } catch (IllegalArgumentException ignored) {
            return;
        }

        Intent intent = new Intent(Intent.ACTION_SEND)
            .setType("image/png")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (text != null && !text.isBlank()) intent.putExtra(Intent.EXTRA_TEXT, text);
        launchChooser(intent, "Diewish planını paylaş");
    }

    private void launchChooser(Intent intent, String title) {
        activity.runOnUiThread(() -> {
            if (!trustedPage.getAsBoolean()) return;
            Intent chooser = Intent.createChooser(
                intent,
                title == null || title.isBlank() ? "Paylaş" : title
            );
            activity.startActivity(chooser);
        });
    }

    private static String sanitizeFilename(String filename) {
        String candidate = filename == null ? "Diewish-plan.png" : filename.trim();
        candidate = candidate.replaceAll("[^A-Za-z0-9._-]", "-");
        if (candidate.isBlank()) candidate = "Diewish-plan.png";
        if (!candidate.toLowerCase().endsWith(".png")) candidate += ".png";
        return candidate.length() > 96 ? candidate.substring(candidate.length() - 96) : candidate;
    }
}
