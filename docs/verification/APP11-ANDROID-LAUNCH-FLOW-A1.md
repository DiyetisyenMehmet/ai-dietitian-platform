# APP11 Android launch presentation A1

Base staging: `47d1107732c32aa2bef37a020a92d1900d7920ff`, tree
`ec6e1ae0c0461bcab9801902af6fbdc1d2d6f2a9`.

## Cause and presentation changes

The supplied cold-start recording shows the native JPEG's opaque rectangular
backing on a dark surface, an unbranded WebView interval, independently fetched
web artwork (slogan first), and a second oversized centered composition that is
replaced by a compact login header.

- Native splash uses a deterministic rounded alpha mask of the approved source
  JPEG. The original source and launcher artwork are untouched. Reproduction:
  `python scripts/branding/generate_launch_icon.py` (development-only Pillow).
- Android 12+ retains the actual system splash until the final web frame, avoiding
  a second icon at the platform's different scale. Legacy starting windows and
  the in-window fallback use the same approved artwork and light/dark surface.
  No timer, extra native animation,
  new Activity, credential or auth condition is introduced. The existing web
  theme callback recolors only the cover's surface, preserving its icon when a
  saved app theme differs from the device theme.
  The retained system splash follows that same surface callback and is released
  on the ready frame, main-frame failure or Activity destruction.
  Android 13+ explicitly prefers the branded system icon even for non-launcher
  starts, rather than allowing the platform's empty-splash default.
- Explicit zero padding on the decorative window drawable prevents its inset
  icon from shrinking DecorView/WebView content. The API 33 phone recording
  checks the actual 390–430 CSS-pixel viewport without relaxing that assertion.
- A presentation-only ready signal on the existing origin-checked system-UI
  bridge removes the native cover after WebView's visual state callback. A short-
  lived DOM observer keeps that single composition over the existing RouteGuard
  waiting UI and guest document redirects until the final application view and
  its artwork are ready. It adds no timer, auth request or auth decision. Older
  web builds and signed-in views use the same observer fallback.
  No empty initial transparent buffer is exposed. Main-frame
  network failures and SSL cancellation release the cover; resource failures do
  not. Existing WebView error behavior and SSL rejection remain intact.
- RouteGuard's existing waiting presentation reuses the final compact auth lockup
  in its final header position. Icon, wordmark and slogan reveal together after
  artwork readiness; image failure displays a text fallback without blocking the
  form. Cached artwork is checked before a remounted header is painted.
- All session, route, consent, Google, phone, cookie and API code is preserved.
  Backend, database, Admin, host configuration and approved web artwork are
  unchanged. The CI source guards compare the PR base/head merge-base diff, so a
  refreshed GitHub merge ref cannot attribute other workers' staging changes
  to this PR. The auth-header guard allows this task's Android presentation
  changes; its protected path list, geometry assertions
  and original accepted visual comparison stay intact.

## Verification boundaries

The dedicated CI records real baseline/changed React views in Chromium at
390/412/430 CSS pixels, light/dark, with delayed artwork and synthetic guest API
responses. These recordings demonstrate the web handoff, not an Android device.
Targeted Robolectric checks cover native resources on API 28/33, transparent
corners, first-frame dismissal, main-frame error recovery and dark surface.
The existing session-cookie host checks are relevant because MainActivity's
startup callback changed. No real account, SMS, health record or backend is used.

The API 33 Pixel 7 emulator harness runs the real MainActivity with the actual locally
built frontend, in separate fresh light/dark app processes. The recording is a
controlled visual test with a held guest reply, not a launch-time benchmark.
The first scenario requires a retained system splash. Android's exit-listener
contract is conditional on the platform showing that splash; the second
instrumentation launch may use the native fallback. Both scenarios require the
loading cover through guest routing, release on the final frame, stable header
geometry and the actual mobile viewport. Any system splash already observed at
startup must remain the same object while waiting. The selected native path is
recorded in the evidence trace. See the platform contract:
https://developer.android.com/reference/android/window/SplashScreen#setOnExitAnimationListener(android.window.SplashScreen.OnExitAnimationListener)
Test-only WebView interception serves that
frontend from a local TLS fixture with a pinned job certificate and normal
hostname verification; all account API replies are synthetic guests. A sink proxy
prevents the initial pre-interception navigation from reaching staging; only
that deliberately canceled pre-fixture request's callbacks are excluded from
the test. All real fixture navigation/error callbacks still go through the
original client, including SSL rejection. Native
SSL rejection and trusted-origin checks are unchanged. Ephemeral test packages
are installed only in the fresh emulator, never uploaded or distributed.

There is no attached physical phone. Physical cold/warm start, saved web theme
differing from the device theme, offline/retry and rotation remain acceptance
checks before publication. No deploy or APK publication is performed by this PR.
Native and web may deliberately use different stored
light/dark preferences; this PR does not rewrite theme preference policy.
