# APP5-BOTTOM-NAV-SCROLL-CONTAINMENT-A2

Owner: Uygulama Çalışan 5 — Android Oturum / Auth

Source verified before work: `feature/staging-preview`, HEAD `efb3060aaf1ab9330adb17162332074a7c0fe808`, TREE `ea4fd3a83166a9d80f42ffed4a079ebd453cb2b5`.
Work branch: `feature/app5-bottom-nav-scroll-containment-a2`.
No staging integration/deploy or production change is authorized in this task.

## Evidence and root cause

Reviewed both supplied recordings, `1000448516.mp4` (Android, 9.89 s) and `1000448517.mp4` (Web, 11.91 s). Private recording frames are not reproduced in this report. Screenshots/measurements use the existing local Dashboard browser fixture and synthetic data, with real production-built application components.

Normal AppShell used `min-h-dvh` with an intrinsically expanding main. The document owned vertical scrolling; BottomNavigation was an overlapping fixed sibling. Thus the document scrollbar continued through the bottom bar. Coach already had a bounded content region and its own message scroller: two different scroll contracts. Merely adding `fixed` again could not fix this.

At 390 × 844, before: document scrollHeight 1929; scrollY changed 49 → 1085; main scrollTop stayed zero and overflowY was visible. The document scrollport ended at 844, while nav top was 770.5. In a steady Chromium viewport the existing fixed nav was already stationary. This does not reproduce or certify every transient native fling/browser-toolbar frame in the videos. Web toolbar changes and Android root overscroll operate on that incorrect document scroll owner.

After: document scrollHeight 844 and scrollY zero; main scrollTop changed 26 → 1084. Main's box ends at 770.5, exactly nav top. Nav remains 770.5–844 during repeated scrolling. The scrollbar's owning element now ends above the menu. Chromium overlay indicators are transient; the regression measures the real scrollport rather than assuming a persistent painted indicator.

## Minimal product changes

- AppShell is a bounded flex viewport with a separate `main[data-app-scroll]` scrollport. Header and BottomNavigation occupy intrinsic sibling space outside scrolling content. No global overflow hiding, arbitrary z-index patch, transform, or auth change.
- Dynamic viewport units provide the fallback. Scoped VisualViewport height/offset updates account for browser chrome and visual-only keyboard resizing. Pinch magnification does not trigger application reflow.
- Fill mode continues to delegate scrolling to Coach. It does not add a competing outer scrollbar.
- BottomNavigation retains all icons, labels, active styling, safe-area padding and measured height. Its position is now relative inside the fixed shell. A1's combined bottom reserve is preserved by subtracting the in-flow bar height from content padding. Last cards remain reachable.
- Dashboard reorder coordinates and intentional touch-hold scroll locking follow the actual content scrollport, with the existing document fallback outside AppShell. Immediate touch swipes continue to scroll.
- Existing browser tests measure/scroll the actual owner instead of obsolete window scroll calls. All 51 A1 scenarios and their behavioral expectations remain. Added 12 A2 scenarios; the existing Hardening browser job runs all 63. The work branch is enabled on the existing Hardening workflow; no duplicate workflow or QA platform change.

## Measured geometry

Long unbroken name, light theme, normal text; both pre/post scroll menu coordinates:

| Width × height | Nav top before scroll | Nav top after scroll | Nav bottom | Scrollport bottom | Document scrollY |
| --- | ---: | ---: | ---: | ---: | ---: |
| 320 × 700 | 610 | 610 | 700 | 610 | 0 |
| 360 × 800 | 726.5 | 726.5 | 800 | 726.5 | 0 |
| 390 × 844 | 770.5 | 770.5 | 844 | 770.5 | 0 |
| 412 × 915 | 841.5 | 841.5 | 915 | 841.5 | 0 |
| 430 × 932 | 858.5 | 858.5 | 932 | 858.5 | 0 |
| 768 × 1024 | 950.5 | 950.5 | 1024 | 950.5 | 0 |

Widths, light/dark, normal/long names and 100/130% computed font sizes exercise actual Chromium layout. No document or inner horizontal overflow; five tabs are visible/hittable. Safe-area bottom 34 px and heights 844/700/915 are exercised with Chromium device metrics. A controlled visual-only height 420/offset 40 event verifies shell/nav bottom 460 while layout height stays 844, including Coach textarea above nav. This is a viewport event contract test, not a physical keyboard certification.

## Local validation

- Frontend production build, TypeScript check, lint: PASS (lint has existing unrelated warnings).
- Relevant frontend contracts: 167/167 PASS, including auth/session, Coach synchronization, identity, notifications, card geometry/personalization and Journey sources.
- Dashboard viewport suite: 63/63 PASS (51 retained + 12 new); no skipped tests.
- Compact Journey real-browser suite: 14/14 PASS.
- Dashboard edit and Dashboard/Coach modal browser E2E: 21/21 PASS, including real Chromium touch swipe/hold, pointer/keyboard reorder, explicit persistence, discard/failure, light/dark, modal focus and reduced-motion behavior.
- Five primary tabs, notification back-navigation, theme controls and saved personalization are exercised by the viewport suite.
- Braces depth guard: PASS; dependencies/locks unchanged. Full dependency/native/backend gates run on the exact work-branch SHA in existing Hardening CI; inspect linked Actions results in handoff.
- Fresh build verification rejects stale route bundles before browser assertions. A local generated Next runtime route cache was moved out after it referenced an old bundle; the current compiled bundle was verified before successful tests. No framework/cache/security code was changed.

## Web / Android boundary and remaining QA

Web has browser toolbar/visual viewport changes. Android receives its application viewport inside native system-bar/cutout padding; unchanged MainActivity still applies those insets and preserves TLS, cookie and session security. Both now receive the same frontend scroll architecture.

No adb, Android SDK/emulator or KVM device is available locally. Native build/unit tests in Hardening are not an authenticated Android WebView runtime PASS. Manager/QA must test an A2 staging-bound APK after approved integration: repeated flings, visible indicator end, all tabs, native keyboard/IME, system safe-area, Coach and modal controls. Real mobile Chrome toolbar show/hide should also be checked; headless viewport resizing cannot certify browser chrome animation. Do not mark these physical-runtime checks PASS from Chromium results.

Delivery boundary: clean pushed work branch, READY FOR INTEGRATION; await manager approval before changing staging. Physical Web/Android QA remains open, so overall acceptance is not 100%.
