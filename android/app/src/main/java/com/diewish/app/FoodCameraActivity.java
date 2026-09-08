package com.diewish.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.view.CameraController;
import androidx.camera.view.LifecycleCameraController;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.IOException;

/**
 * First-party Diewish food camera.
 *
 * CameraX keeps capture behavior consistent across Samsung, Pixel, Xiaomi and
 * other Android camera implementations. Gallery access uses Android Photo
 * Picker, so the app does not need broad photo-library permission.
 */
public final class FoodCameraActivity extends ComponentActivity {
    private static final int CONTROL_SIZE_DP = 52;
    private static final int SHUTTER_SIZE_DP = 78;

    private LifecycleCameraController cameraController;
    private boolean usingFrontCamera = false;
    private boolean captureInProgress = false;
    private TextView shutterButton;
    private ImageButton switchCameraButton;

    private final ActivityResultLauncher<PickVisualMediaRequest> photoPicker =
        registerForActivityResult(
            new ActivityResultContracts.PickVisualMedia(),
            uri -> {
                if (uri != null) returnSelection(uri);
            }
        );

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

        setContentView(buildCameraUi());
        startCamera();
    }

    private View buildCameraUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

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
        cameraController.setEnabledUseCases(CameraController.IMAGE_CAPTURE);
        cameraController.setCameraSelector(CameraSelector.DEFAULT_BACK_CAMERA);
        preview.setController(cameraController);

        LinearLayout topBar = new LinearLayout(this);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setPadding(dp(16), dp(10), dp(16), dp(8));

        TextView close = circularTextButton("×", 34, CONTROL_SIZE_DP);
        close.setContentDescription("Kamerayı kapat");
        close.setOnClickListener(view -> cancelAndFinish());
        topBar.addView(close);

        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        root.addView(topBar, topParams);

        LinearLayout bottomBar = new LinearLayout(this);
        bottomBar.setGravity(Gravity.CENTER_VERTICAL);
        bottomBar.setPadding(dp(28), dp(18), dp(28), dp(18));

        ImageButton gallery = iconButton(android.R.drawable.ic_menu_gallery, "Galeriden seç");
        gallery.setOnClickListener(view -> openPhotoPicker());
        bottomBar.addView(gallery, squareLayout(CONTROL_SIZE_DP));

        View leftSpacer = new View(this);
        bottomBar.addView(leftSpacer, new LinearLayout.LayoutParams(0, 1, 1f));

        shutterButton = circularTextButton("", 1, SHUTTER_SIZE_DP);
        shutterButton.setContentDescription("Fotoğraf çek");
        shutterButton.setBackground(shutterDrawable());
        shutterButton.setOnClickListener(view -> capturePhoto());
        bottomBar.addView(shutterButton, squareLayout(SHUTTER_SIZE_DP));

        View rightSpacer = new View(this);
        bottomBar.addView(rightSpacer, new LinearLayout.LayoutParams(0, 1, 1f));

        switchCameraButton = iconButton(android.R.drawable.ic_menu_revert, "Kamerayı değiştir");
        switchCameraButton.setOnClickListener(view -> switchCamera());
        bottomBar.addView(switchCameraButton, squareLayout(CONTROL_SIZE_DP));

        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        );
        root.addView(bottomBar, bottomParams);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            topBar.setPadding(dp(16) + safe.left, dp(10) + safe.top, dp(16) + safe.right, dp(8));
            bottomBar.setPadding(
                dp(28) + safe.left,
                dp(18),
                dp(28) + safe.right,
                dp(18) + safe.bottom
            );
            return insets;
        });

        return root;
    }

    private void startCamera() {
        try {
            cameraController.bindToLifecycle(this);
        } catch (RuntimeException error) {
            Toast.makeText(this, "Kamera başlatılamadı.", Toast.LENGTH_LONG).show();
            cancelAndFinish();
        }
    }

    private void openPhotoPicker() {
        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
            .build();
        photoPicker.launch(request);
    }

    private void switchCamera() {
        if (captureInProgress) return;
        CameraSelector next = usingFrontCamera
            ? CameraSelector.DEFAULT_BACK_CAMERA
            : CameraSelector.DEFAULT_FRONT_CAMERA;
        try {
            cameraController.setCameraSelector(next);
            usingFrontCamera = !usingFrontCamera;
        } catch (RuntimeException error) {
            Toast.makeText(this, "Bu kamera kullanılamıyor.", Toast.LENGTH_SHORT).show();
        }
    }

    private void capturePhoto() {
        if (captureInProgress) return;
        File output;
        try {
            File sharedDir = new File(getCacheDir(), "shared");
            if (!sharedDir.exists() && !sharedDir.mkdirs()) {
                throw new IOException("Unable to create capture directory");
            }
            output = File.createTempFile("diewish-food-", ".jpg", sharedDir);
        } catch (IOException error) {
            Toast.makeText(this, "Fotoğraf kaydedilemedi.", Toast.LENGTH_LONG).show();
            return;
        }

        captureInProgress = true;
        shutterButton.setEnabled(false);
        switchCameraButton.setEnabled(false);

        ImageCapture.OutputFileOptions options =
            new ImageCapture.OutputFileOptions.Builder(output).build();
        cameraController.takePicture(
            options,
            ContextCompat.getMainExecutor(this),
            new ImageCapture.OnImageSavedCallback() {
                @Override
                public void onImageSaved(ImageCapture.OutputFileResults outputFileResults) {
                    Uri uri = FileProvider.getUriForFile(
                        FoodCameraActivity.this,
                        getPackageName() + ".fileprovider",
                        output
                    );
                    returnSelection(uri);
                }

                @Override
                public void onError(ImageCaptureException exception) {
                    captureInProgress = false;
                    shutterButton.setEnabled(true);
                    switchCameraButton.setEnabled(true);
                    //noinspection ResultOfMethodCallIgnored
                    output.delete();
                    Toast.makeText(
                        FoodCameraActivity.this,
                        "Fotoğraf çekilemedi. Lütfen tekrar deneyin.",
                        Toast.LENGTH_LONG
                    ).show();
                }
            }
        );
    }

    private void returnSelection(Uri uri) {
        Intent result = new Intent();
        result.setData(uri);
        result.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        setResult(RESULT_OK, result);
        finish();
    }

    private void cancelAndFinish() {
        setResult(RESULT_CANCELED);
        finish();
    }

    @Override
    public void onBackPressed() {
        cancelAndFinish();
    }

    private ImageButton iconButton(int iconRes, String description) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(iconRes);
        button.setColorFilter(Color.WHITE);
        button.setContentDescription(description);
        button.setPadding(dp(13), dp(13), dp(13), dp(13));
        button.setBackground(translucentCircle());
        return button;
    }

    private TextView circularTextButton(String text, int textSizeSp, int sizeDp) {
        TextView button = new TextView(this);
        button.setText(text);
        button.setTextSize(textSizeSp);
        button.setTextColor(Color.WHITE);
        button.setGravity(Gravity.CENTER);
        button.setBackground(translucentCircle());
        button.setMinWidth(dp(sizeDp));
        button.setMinHeight(dp(sizeDp));
        return button;
    }

    private LinearLayout.LayoutParams squareLayout(int sizeDp) {
        return new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp));
    }

    private GradientDrawable translucentCircle() {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(0x66000000);
        return background;
    }

    private GradientDrawable shutterDrawable() {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(Color.WHITE);
        background.setStroke(dp(4), 0x99FFFFFF);
        return background;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
