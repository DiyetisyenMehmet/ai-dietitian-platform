package com.diewish.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.Image;
import android.os.Bundle;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.view.CameraController;
import androidx.camera.view.LifecycleCameraController;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * First-party Diewish retail barcode scanner.
 *
 * Frames stay on-device. ML Kit decodes only common retail EAN/UPC formats and
 * this Activity returns the numeric identifier to the trusted WebView host.
 * No barcode camera frame is uploaded to Diewish or a nutrition provider.
 */
public final class BarcodeScannerActivity extends ComponentActivity {
    public static final String EXTRA_BARCODE = "diewish.barcode";

    private static final int CONTROL_SIZE_DP = 52;
    private static final int SCAN_WIDTH_DP = 300;
    private static final int SCAN_HEIGHT_DP = 180;

    private final AtomicBoolean processing = new AtomicBoolean(false);
    private final AtomicBoolean delivered = new AtomicBoolean(false);
    private final ExecutorService analyzerExecutor = Executors.newSingleThreadExecutor();

    private LifecycleCameraController cameraController;
    private BarcodeScanner barcodeScanner;
    private FrameLayout rootView;
    private TextView torchButton;
    private boolean torchEnabled;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.BLACK);

        if (
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED
        ) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A,
                Barcode.FORMAT_UPC_E
            )
            .build();
        barcodeScanner = BarcodeScanning.getClient(options);

        setContentView(buildScannerUi());
        startCamera();
    }

    private View buildScannerUi() {
        FrameLayout root = new FrameLayout(this);
        rootView = root;
        root.setBackgroundColor(Color.BLACK);
        root.setKeepScreenOn(true);

        PreviewView preview = new PreviewView(this);
        preview.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        root.addView(
            preview,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        );

        cameraController = new LifecycleCameraController(this);
        cameraController.setEnabledUseCases(CameraController.IMAGE_ANALYSIS);
        cameraController.setCameraSelector(CameraSelector.DEFAULT_BACK_CAMERA);
        cameraController.setImageAnalysisBackpressureStrategy(
            ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
        );
        cameraController.setImageAnalysisAnalyzer(analyzerExecutor, this::analyzeFrame);
        preview.setController(cameraController);

        TextView close = circularButton("×", 34);
        close.setContentDescription("Barkod tarayıcıyı kapat");
        close.setOnClickListener(view -> cancelAndFinish());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
            dp(CONTROL_SIZE_DP),
            dp(CONTROL_SIZE_DP),
            Gravity.TOP | Gravity.START
        );
        closeParams.leftMargin = dp(18);
        closeParams.topMargin = dp(12);
        root.addView(close, closeParams);

        torchButton = circularButton("Işık", 13);
        torchButton.setContentDescription("Feneri aç veya kapat");
        torchButton.setOnClickListener(view -> toggleTorch());
        FrameLayout.LayoutParams torchParams = new FrameLayout.LayoutParams(
            dp(CONTROL_SIZE_DP + 8),
            dp(CONTROL_SIZE_DP),
            Gravity.TOP | Gravity.END
        );
        torchParams.rightMargin = dp(18);
        torchParams.topMargin = dp(12);
        root.addView(torchButton, torchParams);

        FrameLayout scanFrame = new FrameLayout(this);
        scanFrame.setBackground(scanFrameDrawable());
        FrameLayout.LayoutParams frameParams = new FrameLayout.LayoutParams(
            dp(SCAN_WIDTH_DP),
            dp(SCAN_HEIGHT_DP),
            Gravity.CENTER
        );
        root.addView(scanFrame, frameParams);

        TextView instruction = new TextView(this);
        instruction.setText("Barkodu çerçevenin içine hizala");
        instruction.setTextColor(Color.WHITE);
        instruction.setTextSize(17);
        instruction.setGravity(Gravity.CENTER);
        instruction.setBackground(translucentRoundedRectangle());
        instruction.setPadding(dp(16), dp(10), dp(16), dp(10));
        FrameLayout.LayoutParams instructionParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
        );
        instructionParams.bottomMargin = dp(42);
        root.addView(instruction, instructionParams);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            closeParams.leftMargin = dp(18) + safe.left;
            closeParams.topMargin = dp(12) + safe.top;
            close.setLayoutParams(closeParams);
            torchParams.rightMargin = dp(18) + safe.right;
            torchParams.topMargin = dp(12) + safe.top;
            torchButton.setLayoutParams(torchParams);
            instructionParams.bottomMargin = dp(42) + safe.bottom;
            instruction.setLayoutParams(instructionParams);
            return insets;
        });

        return root;
    }

    private void startCamera() {
        try {
            cameraController.bindToLifecycle(this);
        } catch (RuntimeException error) {
            Toast.makeText(this, "Barkod kamerası başlatılamadı.", Toast.LENGTH_LONG).show();
            cancelAndFinish();
        }
    }

    private void analyzeFrame(ImageProxy imageProxy) {
        if (delivered.get() || !processing.compareAndSet(false, true)) {
            imageProxy.close();
            return;
        }

        Image mediaImage = imageProxy.getImage();
        if (mediaImage == null) {
            processing.set(false);
            imageProxy.close();
            return;
        }

        InputImage input = InputImage.fromMediaImage(
            mediaImage,
            imageProxy.getImageInfo().getRotationDegrees()
        );
        barcodeScanner.process(input)
            .addOnSuccessListener(this::handleBarcodes)
            .addOnFailureListener(error -> {
                // Individual frames can fail while focus/exposure is changing.
            })
            .addOnCompleteListener(task -> {
                processing.set(false);
                imageProxy.close();
            });
    }

    private void handleBarcodes(List<Barcode> barcodes) {
        if (delivered.get()) return;
        for (Barcode barcode : barcodes) {
            String value = barcode.getRawValue();
            if (value == null) continue;
            String normalized = value.replaceAll("\\D", "");
            int length = normalized.length();
            if (length != 8 && length != 12 && length != 13) continue;
            if (!delivered.compareAndSet(false, true)) return;
            runOnUiThread(() -> returnBarcode(normalized));
            return;
        }
    }

    private void returnBarcode(String barcode) {
        if (rootView != null) {
            rootView.performHapticFeedback(HapticFeedbackConstants.CONFIRM);
        }
        Intent result = new Intent();
        result.putExtra(EXTRA_BARCODE, barcode);
        setResult(RESULT_OK, result);
        finish();
    }

    private void toggleTorch() {
        if (cameraController == null) return;
        torchEnabled = !torchEnabled;
        try {
            cameraController.enableTorch(torchEnabled);
            torchButton.setText(torchEnabled ? "Işık ✓" : "Işık");
        } catch (RuntimeException error) {
            torchEnabled = false;
            torchButton.setText("Işık");
            Toast.makeText(this, "Bu cihazda fener kullanılamıyor.", Toast.LENGTH_SHORT).show();
        }
    }

    private void cancelAndFinish() {
        setResult(RESULT_CANCELED);
        finish();
    }

    @Override
    public void onBackPressed() {
        cancelAndFinish();
    }

    @Override
    protected void onDestroy() {
        if (cameraController != null) {
            cameraController.clearImageAnalysisAnalyzer();
        }
        if (barcodeScanner != null) barcodeScanner.close();
        analyzerExecutor.shutdownNow();
        super.onDestroy();
    }

    private TextView circularButton(String text, int textSizeSp) {
        TextView button = new TextView(this);
        button.setText(text);
        button.setTextSize(textSizeSp);
        button.setTextColor(Color.WHITE);
        button.setGravity(Gravity.CENTER);
        button.setBackground(translucentCircle());
        return button;
    }

    private GradientDrawable scanFrameDrawable() {
        GradientDrawable frame = new GradientDrawable();
        frame.setColor(0x14000000);
        frame.setCornerRadius(dp(24));
        frame.setStroke(dp(3), 0xFF55D6A8);
        return frame;
    }

    private GradientDrawable translucentCircle() {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(0x77000000);
        return background;
    }

    private GradientDrawable translucentRoundedRectangle() {
        GradientDrawable background = new GradientDrawable();
        background.setColor(0x88000000);
        background.setCornerRadius(dp(18));
        return background;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
