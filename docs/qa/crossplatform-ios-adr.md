# ADR — Staging-only native iOS QA shell

Status: minimum shell implemented; runtime acceptance is tracked separately in the handoff report.
Source inspected: staging `f11b0ba708a6902b13fe1a700febfc2c16442300`, tree `97e4070aeec4829091f2fc5c8f789da3cbff9d92`.

## Existing architecture

Web: Next.js 15.5.25, React 19, TypeScript; existing Playwright 1.63.0 and Node contract tests. The frontend has first-party `/api` proxy support and cookie-based session recovery. Login is `/login`; main routes are `/dashboard`, `/ai`, `/profile/notifications`, `/profile`. Existing screenshots/layout tests are browser tests, including Android-user-agent tests; they do not prove a native runtime.

Android: Java host, Android Gradle plugin 9.4.0 / Gradle 9.6.0 in existing CI, Java 17, compile/target SDK 36, minimum SDK 26. Debug builds are strictly bound to `https://staging.diewish.com`. UI loads remotely, rather than packaging an independent frontend bundle. Existing bridges: DiewishScanner, DiewishReminders, DiewishShare, DiewishSystemUi and DiewishBilling; CameraX/ML Kit, FCM and Google Play Billing exist. Debug WebView inspection is already enabled. Existing CI builds APKs/native unit tests, but no emulator evidence run was present.

No iOS project, workspace, Swift/Objective-C source, CocoaPods/SPM wrapper or macOS iOS workflow existed at the inspected source. No Capacitor/React Native/Flutter shared native wrapper was found.

## Decision

Add an independent **test host**, not a second UI/domain product: `ios/DiewishQA.xcodeproj` with UIKit + WKWebView. The same staging frontend/backend/auth/design are used. Xcode project is checked in; there is no project generator dependency, CocoaPods, SPM dependency, Apple account, signing certificate, APNs entitlement or App Store configuration.

Only `iphonesimulator` is supported. HTTPS ATS remains enabled; only the exact staging origin is navigable, including subframes and target-blank requests. No trust challenge bypass, custom auth token bridge, service credential or production URL is introduced. WKWebsiteDataStore.default preserves first-party session storage/cookies. Safe-area layout is native, keyboard adjustment remains WKWebView-owned, gesture back/forward and web-process recovery use WebKit lifecycle behavior.

A small QA toolbar supplies deterministic back/refresh/route controls. Screenshots therefore prove the QA shell, not an App Store production layout. This toolbar occupies 36 points; visual comparisons must exclude it and compare the web content region. It does not impersonate Android native capabilities.

Bridge foundation: `window.webkit.messageHandlers.diewishIOS.postMessage({version:1, operation:'capabilities'})`; only the main frame from staging HTTPS port 443 is accepted. The response is `diewish:ios-capabilities`; unsupported capabilities explicitly return false. The QA-only account observer also accepts only account ID/logout observations from ordinary successful web auth responses; tokens never cross the bridge. It compares a protected expected ID and writes only its HMAC alias for the manual evidence runner. The QA button refuses populated credentials and masks displayed email identities for capture. These are test-host controls, not product auth or permission changes. A weak handler avoids retaining the view controller. Debug-only Web Inspector is enabled; no arbitrary JS/native operation dispatch exists.

## Capability gaps

| Capability | Minimum iOS host | Test requirement / next adapter |
|---|---|---|
| WKWebView / navigation / cookie session | Implemented | Real simulator login and relaunch |
| Safe area / keyboard | Native layout + WKWebView | Simulator keyboard/rotation checks |
| File/photo chooser | WebKit default file input; not independently proven | Synthetic file via Files/Photos; no broad photo access |
| Camera / barcode | Native adapter absent; capability=false | AVCapture + Vision/AVFoundation; real-camera acceptance needs a physical device |
| Local notifications / permission | Native adapter absent; capability=false | UNUserNotificationCenter, explicit per-account scheduling contract |
| Push | Absent; no APNs entitlement | Separate approved developer/device/APNs work; simulator build needs none |
| Google/phone identity provider | External top-level navigation blocked | Reviewed ASWebAuthenticationSession; email/password QA comes first |
| Deep links | Absent; toolbar is not a deep-link test | Universal/custom-link policy and native route allowlist |
| Share / payments | Native adapter absent | Out of A1 scope; no payment behavior changes |

Do not add partial DiewishReminders methods that would cause frontend capability detection to treat iOS as fully capable. Notification adapter work remains a later task owned with the existing notification architecture.

## Sources checked

- Apple WKScriptMessage / WKFrameInfo: https://developer.apple.com/documentation/webkit/wkscriptmessage
- WebKit inspectability (iOS 16.4+): https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/
- Apple Xcode 16.3 xcresulttool export: https://developer.apple.com/documentation/xcode-release-notes/xcode-16_3-release-notes
- Playwright native Android WebView: https://playwright.dev/docs/api/class-android

These APIs are infrastructure choices. They do not establish Diewish feature parity.
