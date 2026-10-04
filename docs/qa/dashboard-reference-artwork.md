# Dashboard: compact reference artwork restoration

## Scope and integration

- Local work only; no push, workflow dispatch or deployment.
- Started from the available `1d30aad` working copy, whose tree matched remote `3fb46b7`. The previously reported `b7cc482` object was absent from this workspace, so its claimed validation was not reused.
- Integrated the concurrent branch changes through `3949e6026e7196a3cfbb42b998bf6f662a7fef5c` (tree `916cd46b784915b72497c7dda3d8e6c2fa0deec9`). Retained the existing blood summary/tube component, crop, clipped SVG and 24px tube contract. Navigation and notification work is preserved.

## Changes

- Food and progress use the original theme artwork, extending to the card's upper, lower and right edges, with no inner frame. Artwork includes the existing source chevron, so the redundant feature chevron is removed.
- Illustration source coordinates affect decorative pixels only. Live titles/descriptions remain in independent, wrapping flow columns; no fixed card height or fixed text coordinates were reintroduced.
- Main titles 12px, descriptions 10px; Coach title 11px and action 10px. Blood preview retains the concurrent 9px labels and 8.5px values, with its tube on the right.
- Existing compactness tests now check artwork edge alignment, absence of an inner border/background/shadow, text hierarchy and retained tube clipping. The stale Coach viewport-font source check is replaced by the actual computed typography checks; unrelated home typography checks remain.

## Measured 390×844 / 100% (production Inter)

| Card | Height | Result |
|---|---:|---|
| Food/barcode | 84px | 144px-wide edge-to-edge illustration; one-line title |
| Blood test | 87.78px | Compact right preview plus original tube; one-line title |
| Progress | 84px | Edge illustration; one-line title |
| Coach | 70px | Horizontal action and one-line title |

At 320px / 130%, artwork and the blood summary wrap below the copy. Text remains visible without horizontal overflow, region overlap or ellipsis. Text enlargement is not disabled.

## Validation

- Production Inter: 50/50 layout tests passed.
- Nine widths: 320, 360, 390, 412, 430, 480, 768, 1024, 1440; TR/EN and light/dark; 100/120/130/150/200% text and 200% root-font stress.
- Related card/home/Journey unit tests: 72/72 passed.
- Fallback-font layout: 50/50 passed. Final `npm run build`: passed (pre-existing lint warnings remain). Logs are in the matching `frontend/test-results/reference-*.log` files.
- Rendering engine: Chrome for Testing headless shell 145.0.7632.6; production React components and Tailwind CSS are rendered by the existing account-free fixture.
- Normal Chrome could not launch under the host's local-socket restrictions; headless shell ran within the existing permissions. This is browser measurement, not Android WebView emulation.
- Authenticated end-to-end navigation tests were updated but not executed against a deployed environment. Real Android APK/WebView verification remains outstanding.

## Visual evidence

Under `frontend/test-results/reference-final/`:

- `diewish-390-reference-light.png`
- `diewish-390-reference-dark.png`
- `diewish-320-130-reference.png`
- `diewish-reference-comparison.png`

The comparison uses the previously captured `84ccfc4` compact browser layout and the current source-component fixture at the same viewport. It demonstrates the preserved compact proportions; it is not a pixel-identical claim or a full authenticated Dashboard/device test.
