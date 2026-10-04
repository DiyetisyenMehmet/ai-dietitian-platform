# Blood preview: reference typography and original tube

This follow-up modifies only the Blood Test preview and its decorative right artwork. Food, Progress, Coach and the Blood Test main copy retain the preceding implementation.

Reference: user attachment `upload/01-1000443174.jpg`, supplied on 2026-10-04. The image comparison crops the reference Blood Test card to the same 358px card width as the 390px local fixture.

## Correction

- Preview heading: 9px → 6px; status and row labels: 9px → 5.5px; values: 8.5px → 5.25px, with weight 500. All remain live text and respect text enlargement.
- The previous 24px isolated tube and oval fade mask were visually incorrect. The original asset's complete right region now includes the intact tube, blue/ribbon background and original chevron. The region reaches the card edges without a mask; a second HTML chevron is removed.
- The 110px preview remains beside the main copy at normal phone widths. At insufficient width it and the right artwork wrap as one existing summary. No fixed live text coordinates or fixed card height are added.
- At 390×844 / 100%, the measured card height is 88.625px. The decorative right region is 52px × 86.625px, including its original surrounding background; this is not the tube's isolated visible width.

## Verification

- 50/50 production-Inter browser layout tests passed: nine widths, TR/EN, light/dark, 100–200% text stress and 200% root font. No glyph overflow or overlapping flow regions.
- 320px / 130% fallback passed; all five rows remain present.
- 3/3 related Blood Test unit tests passed.
- Final `npm run build` passed. The log is `frontend/test-results/blood-reference-build.log`; existing lint warnings are unchanged.
- Real Android/WebView validation remains outstanding. Screenshots use production components in the local Chromium fixture, not an APK.
- No push or deployment performed.

Artifacts in `frontend/test-results/blood-reference-final/`:

- `diewish-blood-390-light.png`
- `diewish-blood-390-dark.png`
- `diewish-blood-320-130.png`
- `diewish-blood-reference-comparison.png`

This follow-up supersedes the Blood Test preview size and 24px tube specification in `dashboard-reference-artwork.md`; the other cards' specifications remain valid.
