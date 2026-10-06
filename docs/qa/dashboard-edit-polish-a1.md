# WORKMODE-DASHBOARD-EDIT-POLISH-A1

## Scope and source

- Work branch: `feature/workmode-dashboard-edit-polish-a1`.
- Source branch: `feature/staging-preview`.
- Start HEAD: `4a956c1e7631058820da6408a1ff7958a4f09472`.
- Start TREE: `fc2f78a9433fd7950815de1fad7b73b49e8f9a2e`.
- Approved visual: the last supplied edit-mode reference, `1000446538.png`.
- Existing-device examples: `1000446536.mp4` and `1000446539.jpg`.
- Latest user correction takes precedence: keep the existing bottom control box/buttons; change only its hint to “Kartları tutup sürükleyerek sıralayabilirsin”.

## Result

All edit operations affect a draft. Only the bottom Save button sends the account preference PUT. Closing a dirty editor asks to continue editing or discard. A synchronous in-flight guard prevents duplicate submissions. A failed save retains the draft and editor; retry remains available. An unsuccessful initial preference read blocks editing until retry, avoiding an overwrite of an unknown saved layout. Late responses from an old account cannot update the new account's confirmed preferences or saving state.

Dragging begins across the card/tile surface, excluding hide/panel controls. Mouse activation requires 5px movement. Touch requires a 170ms stationary hold; movement over 8px before the hold yields to normal native scrolling. Only an intentional held drag temporarily locks viewport panning, including touch sequences that interrupt a native fling and are already uncancelable; release/cancel/unmount restores the previous overflow style. Immediate swipes retain normal scrolling. Fixed slot midpoint thresholds, pointer-following translation, 220ms layout/drop animations, and a small lift/shadow replace abrupt DOM swaps. Reduced-motion preference skips animations. No dependency was added.

Card dots occupy a thin background-free lane beside the existing icons. Food/Blood/Progress eyes cover exactly the existing 8cqw arrow circle; the previous arrow glyph is invisible in edit mode and returns normally. Coach replaces the actual CTA chevron with an equally sized eye in the existing pill, preserving its text and geometry. Quick Action eyes/dots share a vertical center and have no separate bubble. Card content, fixed aspect ratios, default order, and the bottom controls are preserved.

## Integration verification — WORKMODE-DASHBOARD-EDIT-POLISH-A1-INTEGRATE-01

- Integration source HEAD: `31215d61b06f4505dcf9dc5291c06b479a5c90fa`.
- Integration source TREE: `25c890c34100392d3d05e014f4f6e6428389647b`.
- The source was merged into the isolated work branch, preserving its backend, Android, dependency and nutrition-plan updates.
- Candidate HEAD: `5df63f2f691a88fc9fb960730f5ec3fb35b9dfe8`.
- Candidate TREE: `9c717bb18e6e356c1ba06bbbf12c98ad2dd4f954`.
- Full candidate Hardening run: https://github.com/DiyetisyenMehmet/ai-dietitian-platform/actions/runs/37539050987.

| Check | Evidence |
| --- | --- |
| Edit, Save-only persistence, dirty discard/continue, duplicate save, failure/retry | Browser HTTP-boundary regression suite |
| Full card/tile surface, pointer following, midpoint reorder, neighbor/drop animation, keyboard | Browser regression suite |
| Native scrolling followed immediately by held card/tile dragging | Chromium 153.0.8010.12, native CDP touch events; 6/6 editor tests PASS |
| Dots, exact arrow-slot eyes, normal arrow return, Quick Action alignment | Measured browser bounding boxes and inspected theme screenshots |
| Restore/reset drafts, minimum 3, refresh and account isolation | Browser regression suite |
| Light/dark; 320, 390, 412, 430px; dimensions/no overflow | Browser measurements and screenshots PASS |
| Full frontend Node tests | 157/157 PASS locally |
| TypeScript and changed-source ESLint | PASS |
| Next.js production build | PASS, 62 pages; cached font response used only for local build |
| Backend-connected Dashboard behavior | 11/11 PASS in candidate Hardening against real Postgres/API |
| Backend, frontend, Android, broad browser smoke, security/OSV | PASS: all five candidate Hardening jobs, including broad browser smoke |

No dependencies or lockfiles were changed by this task. The repository's existing OSV policy applies. The earlier polish report's Android/dependency baseline blockers have been resolved in the newer source staging revision; those files were preserved rather than rewritten here.

## Deployment gate and post-deploy evidence

The final integration commit must pass both **Hardening CI** and **Staging Config CI** for its exact SHA before the existing staging workflow touches Google resources. The deployment workflow then runs `e2e/dashboard-edit-sanity.spec.ts` against `https://staging.diewish.com` and its actual account API, using an isolated synthetic test account.

That runtime test checks editor opening, unchanged saved preferences before Save, dirty continue/discard, card and Quick Action reorder, hide/show, Save request counts, persistence after reload, exact eye/arrow placement, no Food-card tilt, and normal Food-card navigation. Its screenshot and test output are uploaded as `dashboard-staging-sanity-<run number>`. A deployment is complete only when the exact-SHA gated workflow and this post-deploy test both pass. Real-device acceptance is separate.

The task preserves the existing bottom control card and buttons; only the hint text changes. The final visual reference remains the user-approved image with this later correction.

- Production touched: NO.
- Main touched: NO.
- Nutrition-plan changes made by this task: NO.
- Other worker branches touched: NO.
- Force push: NO.
