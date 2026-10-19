# Approved Diewish Android launcher icon

- **Approved by project owner:** 2026-10-19, reference image supplied in conversation as `1000452661.png`.
- **Design:** wordmark-free, pale rounded-square background, blue/cyan iD curves with dark navy lower region and two green leaves. Do not replace it with a generated or placeholder launcher icon.
- **Checked-in asset:** `android/app/src/main/res/drawable-nodpi/ic_launcher_approved.webp` (192×192 WebP RGB, resized from the approved 1536×1536 image; SHA-256: `02e25acbea1c2d2c4eee48aaaa418db9a9f7c6e0350dfd62c53fcf79d168d8ce`).
- **Android:** manifest uses `@mipmap/ic_launcher`; Android 8+ adaptive icon wraps the approved raster with a white background and inset safe area. The previous `@drawable/ic_launcher` fallback now references the same approved raster.
- **Scope:** icon resources only. No app feature, Firebase, authentication, environment flag, release workflow, staging runtime, Admin, or production changes.
- **Release:** include this icon in the next APK after review and Android resource/launcher tests. Do not generate or distribute an APK as part of this source-only change.
