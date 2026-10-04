# Blood card: original wave background

Reference: user attachment `upload/01-1000444036.jpg`, supplied on 2026-10-04.

The Blood Test card now renders the original asset's bottom pink and blue waves. A decorative SVG clips only the wave areas, so the source icon, empty panel and tube cannot appear behind live content when the summary wraps. The dark theme uses its corresponding source asset. The background follows the card's fluid height and rounded corners.

The preceding preview typography, 110px preview and complete 52px right artwork are preserved. At 390px / 100%, the card remains 88.625px high; the right artwork remains 86.625px high. Heading, label and value fonts remain 6px, 5.5px and 5.25px respectively. No other card or navigation is changed.

Verification:

- 50/50 production-Inter browser layout checks and 3/3 Blood Test unit checks passed. The layout suite covers nine widths, both languages and themes, enlarged text, overflow, fallback and interactive targets.
- The reference comparison, dark theme and 320px / 130% fallback were visually inspected. Only the bottom source waves are exposed, including when the summary wraps.
- `npm run build` passed; the build log is `frontend/test-results/blood-background-build.log`.
- Real Android/WebView validation remains outstanding. Screenshots use production components in the local Chromium fixture.
- No push or deployment performed.

Artifacts: `frontend/test-results/blood-background-final/diewish-blood-background-{390-light,390-dark,320-130,reference-comparison}.png`.
