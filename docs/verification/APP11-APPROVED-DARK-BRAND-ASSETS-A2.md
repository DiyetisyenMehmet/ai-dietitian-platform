# Owner-approved dark brand assets follow-up

Authorized by PR #94 comment [6350518311](https://github.com/DiyetisyenMehmet/ai-dietitian-platform/pull/94#issuecomment-6350518311).
PR #94 is merged; this is one narrow follow-up, based on staging
`17561661d816627d009a9eeb3405d70549f933dc`.

## Artwork and unchanged flow

- `diewish-id-transparent-approved.png` is byte-identical to the supplied
  `1000455084.png` RGBA image. Android's existing 512×512 splash drawable uses
  a uniform resize of that full transparent source, with no generated mask.
- The dark wordmark is the supplied `1000455085.png`, cropped only to its alpha
  bounds `(131, 50, 1124, 256)` (993×206). Every retained RGBA pixel is unchanged.
  Tests pin the approved source/crop hashes. Original artwork is retained.
- The light wordmark is unchanged. Both wordmarks occupy the existing fixed
  box and decode together in the unchanged `BrandArtwork` readiness group.
  Switching the application theme needs no image request or layout movement.
- MainActivity, native/WebView lifecycle, theme resources, session/auth,
  backend, database, Admin and routing code are unchanged.

## Narrow verification

The exact-path follow-up selector runs only the changed artwork checks,
new browser renders and existing two real MainActivity recording scenarios.
Any unlisted change restores the existing broad workflow. Source guards
continue to protect all old brand assets and application behavior, allowing
only the two named new approved PNGs.

- Six pixel tests: supplied source/crop integrity, identical resized RGBA,
  transparent negative space, opaque mark details and reproducibility.
- Two Android drawable tests, API 28/33; no repeated session-cookie suite.
- Real Chromium: six before references and ten after tests. At 390/412/430px
  in both themes, check startup/login bounds, unchanged form position, theme
  switching without new image requests, delayed dark artwork and all three
  asset failures. Before references are renders of the accepted staging
  source, not regenerated mockups.
- Real API 33 Pixel 7 MainActivity: light/dark launch/login screenshots and
  complete recordings using the existing local production frontend and
  synthetic guest TLS fixture. No real backend/account/SMS/health data.

Local Chromium download failed, so the browser and emulator evidence must
come from GitHub Actions. This document describes the required checks; the
PR records their actual results and artifact links. Prior accepted broad
PR #94 suites are not rerun for this follow-up.

No physical phone is attached; final hardware QA is not claimed. Test packages
are ephemeral emulator inputs only; no APK distribution, merge, deploy,
Neon/migration, production/main or Admin action is authorized. Security #95
remains a separate frontend release gate; this follow-up does not fix it.
