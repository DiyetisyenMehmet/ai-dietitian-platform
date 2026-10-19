# APP10 branding: startup and login header

Base staging commit: `cfa3e40fdcc086d2e84c2cd37c33e7f434e4e04f`.

## Findings and change

- Android had no Android 12 splash override, so the system used the launcher icon. That approved launcher raster is only 192x192 pixels and is enlarged for the startup presentation. It remains unchanged. A separate 1536x1536 original now supplies the Android 12+ splash through light/night themes and a 48dp inset within the 288dp canvas. This avoids enlarging the launcher thumbnail and keeps the artwork inside the platform safe area. No startup delay or native session changes were added.
- The spinner following the native icon belongs to the Web `RouteGuard` loading presentation. Normal user startup now shows a static approved icon, wordmark and tagline, with an accessible loading status. All session hydration, consent, identity exceptions and redirect decisions are unchanged. The existing Admin presentation is preserved.
- The login layout already contained the approved branding in staging source. The public site header still used the old Leaf symbol. Both headers now use one small shared presentation component with the existing approved wordmark and tagline: "Sağlığın için, her zaman yanında." Narrow layouts may wrap the tagline; images keep their aspect ratio. In dark mode a small white backing behind the transparent wordmark preserves the original navy lettering without changing the image.

## Approved assets

- Original owner-provided `1000452661.png` contains JPEG bytes, 1536x1536. The new `.jpg` files copy those exact bytes; no redraw, resampling or re-encoding occurred.
- Original SHA-256: `87a2d1e66c799ecd1860f82501d8dec813ba5cf9665b7b219e84d379e7e45251`.
- Launcher/header thumbnail remains `02e25acbea1c2d2c4eee48aaaa418db9a9f7c6e0350dfd62c53fcf79d168d8ce`.
- The approved transparent wordmark, manifest icon/roundIcon, adaptive launcher, MainActivity and all native bridges remain unchanged.

## Targeted verification

- `npm run type-check`.
- `npm run build`: Web compilation, types/lint and static page generation. Existing unrelated lint warnings remain; no lint rule was disabled.
- `npx playwright test --config=playwright.branding.config.ts`: 14 presentation tests, 320/390/412/430/1024/1440px, light/dark, 3x pixel density, header images, no horizontal overflow and brand bounds inside the header; startup with normal/reduced motion, no rotation and successful synthetic guest redirect to login. No real account or provider calls.
- `node --test tests/auth-session-restore.test.cjs`: 13 tests.
- Android SDK 36 `aapt2 compile` and `aapt2 link` against the existing manifest, with only normal build-time package/provider placeholders resolved in a temporary manifest. Both light/night-v31 theme entries and the original image bytes were checked in the compiled resource package. This is resource compilation, not a full Gradle build or an installable APK.
- Existing approved assets and Android manifest were compared byte-for-byte against the base. The RouteGuard diff was checked to contain only the presentation import and rendered component choice.

## Release and QA limits

This PR does not merge or deploy staging, generate an APK, activate flags, or change backend/Admin/security/Firebase/database configuration. The native high-resolution splash needs a later APK; the Web startup/header needs a later Web deployment. An already installed APK still displays the currently published Web version. Android 8-11 retain their existing system launch behavior and receive the branded Web loading presentation after the Web update. Actual Android cold/warm launch, launcher mask and native-to-Web transition still need device QA; a resource compile cannot certify those visual transitions.

Platform reference: https://developer.android.com/develop/ui/views/launch/splash-screen
