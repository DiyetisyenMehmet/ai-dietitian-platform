# WORKMODE2-DASHBOARD-JOURNEY-COMPACT-TEXT-A1

Source: `feature/staging-preview`, HEAD `33c8e1df87094a55b7dc445afe91457e02c96258`, TREE `11748158c9f63890612a15c7f8651e7a81e283f3`.

## Result and scope

- Heading: “Bugünkü Yolculuğum”.
- Removed the full-width “Tümünü göster” footer and its spacing.
- The existing details button now sits to the right of the shorter progress area. It retains a 44px touch target, accessible name, expanded state, valid controlled list, keyboard activation and the same expanded rows.
- Reduced the Journey header gap, content padding and content spacing. The gaps from Journey to metrics and from metrics to Quick Actions are 12px instead of 20px.
- Editor hint: “Kartları basılı tutup sıralayabilirsin.” The Save/hidden-items controls are unchanged.
- Task typography, task row content/geometry, header, metric rings, feature cards, bottom navigation, Journey decision engine and all account persistence behavior are unchanged.
- No backend, nutrition-plan, Android, dependency or lockfile changes. No production/main changes or force push.

## Measured before/after

The existing production-component fixture was measured with the same four steps, same viewport and same local font before and after this patch. Title/task label/task hint remain 16/14/12px.

| Width | Previous card | New card | Reduction |
| --- | --- | --- | --- |
| 390px | 241.5px | 185.5px | 56px (23%) |
| 412px | 241.5px | 166px | 75.5px (31%) |
| 430px | 222px | 166px | 56px (25%) |

Header spacing saves another 4px; the two following section gaps save another 16px. Exact height depends on the real task text and font. Text is allowed to wrap normally.

## Verification

The existing responsive suite checks light/dark, 320–768px, 130% text, safe expanded rows, touch targets, unchanged font sizes, absence of the old footer and progress/control alignment. The real API-connected Journey browser test checks keyboard expand/collapse, compact height, 12px section gaps, heading, progress alignment, both themes and the exact editor hint. The existing Dashboard editor suites continue to cover Save-only persistence, discard/continue, failed-save draft retention, duplicate-save protection, full-surface mouse/touch drag, minimums, restore/reset, account isolation, eye/arrow and navigation.

The scoped work branch is included in Hardening triggers so the full existing frontend/backend/Android/browser/OSV pipeline can pass before integration. Staging deployment still waits for successful Hardening and Staging Config for its exact SHA. Post-deploy verification now runs both the persisted Dashboard editor sanity and Journey compact test against the actual staging API, uploading their screenshots to the existing evidence artifact.

Local builds use an external cached font only because this workspace cannot fetch Google Fonts. The repository font configuration is unchanged; CI builds use its actual configuration.
