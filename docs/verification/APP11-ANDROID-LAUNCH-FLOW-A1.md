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
- Legacy starting windows and the in-window loading cover share the Android 12+
  splash artwork, size and light/dark surface. No timer, extra native animation,
  new Activity, credential or auth condition is introduced.
- A presentation-only ready signal on the existing origin-checked system-UI
  bridge removes the native cover after WebView's visual state callback, without
  waiting for unrelated page assets. Page completion remains an older-web fallback.
  No empty initial transparent buffer is exposed. Main-frame
  network failures and SSL cancellation release the cover; resource failures do
  not. Existing WebView error behavior and SSL rejection remain intact.
- RouteGuard's existing waiting presentation reuses the final compact auth lockup
  in its final header position. Icon, wordmark and slogan reveal together after
  artwork readiness; image failure displays a text fallback without blocking the
  form. Cached artwork is checked before a remounted header is painted.
- All session, route, consent, Google, phone, cookie and API code is preserved.
  Backend, database, Admin, host configuration and approved web artwork are
  unchanged. The auth-header CI source guard now compares the current PR base,
  and allows this task's Android presentation changes; its geometry assertions
  and original accepted visual comparison stay intact.

## Verification boundaries

The dedicated CI records real baseline/changed React views in Chromium at
390/412/430 CSS pixels, light/dark, with delayed artwork and synthetic guest API
responses. These recordings demonstrate the web handoff, not an Android device.
Targeted Robolectric checks cover native resources on API 28/33, transparent
corners, first-frame dismissal, main-frame error recovery and dark surface.
The existing session-cookie host checks are relevant because MainActivity's
startup callback changed. No real account, SMS, health record or backend is used.

The API 33 emulator harness runs the real MainActivity with the actual locally
built frontend, in light/dark mode. Test-only WebView interception serves that
frontend from a local TLS fixture with a pinned job certificate and normal
hostname verification; all account API replies are synthetic guests. A sink proxy
prevents the initial pre-interception navigation from reaching staging. Native
SSL rejection and trusted-origin checks are unchanged. Ephemeral test packages
are installed only in the fresh emulator, never uploaded or distributed.

There is no attached physical phone. Physical cold/warm start, saved web theme
differing from the device theme, offline/retry and rotation remain acceptance
checks before publication. No deploy or APK publication is performed by this PR.
Native and web may deliberately use different stored
light/dark preferences; this PR does not rewrite theme preference policy.
