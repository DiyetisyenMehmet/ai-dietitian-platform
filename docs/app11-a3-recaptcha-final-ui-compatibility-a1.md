# APP11-A3-RECAPTCHA-FINAL-UI-COMPATIBILITY-A1

Only PhonePasswordFlow's reCAPTCHA view lifecycle changes. This is stacked on
PR #64 so the A4 recovery entry and all dependency source stay intact. No PR title,
history or other worker branch is modified. No backend, schema, migration,
security policy, shared Firebase helper or A4 recovery view changes.

Checked inputs:
- Staging HEAD `12c15074c71c6bc3c84fc7a32b02eaa71f4f32c7`, TREE
  `b48efe9fbcf229858dfd959a2c6de3304937ee66`.
- #57 HEAD `1b5be3aaa6e2864ee24a5bf24e12ddce2b8abcef`.
- #63 HEAD `68d09e2e4f1bf6667d08d40c22dfc06a87a3c8f9`.
- #64 HEAD `5d101eb6ca3dc4a3759624e7889a3f8d0d19814c`, TREE
  `ef226eb2aac5c0545b7d1e4271c785ef40b8b0e6`.
- Isolated A4 foundation HEAD `72c1c668b07edc14195d53fb036f23caead6ec21`, TREE
  `ceb93e1065081f92fb76c5456743a4aeb21f1346`.

The send button is replaced as the verifier target by an independent sibling div
that stays mounted across number/code steps. The inline badge is neither hidden
nor clipped. The fourth memoryOnly=true argument stays; a view-owned
AbortController supplies the fifth signal. Unmount, number/country edits, mode
changes and new attempts abort the old work and retire only its owned widget.
Wrong-code retries retain the current widget. Successful verification clears it
before entering password setup. Late confirmation after unmount is ignored.
Already-sent provider SMS is not claimed to be network-cancelled.

Targeted validation only:
- Frontend type-check and ESLint of changed TypeScript files.
- `npx playwright test --config playwright.phone-recaptcha.config.ts --reporter=line,html`
  runs seven NEW screen-lifecycle scenarios in desktop Chromium and emulated
  Android Chromium. It executes real React + the unchanged #63 helper; only the
  Firebase/network boundary is synthetic. Checks stable DOM, code retry,
  number/resend cleanup, failed-send retry, exit during pending SMS/persistence/
  confirmation, and full 256x60 inline badge fit at 390/412/430 light/dark.
- Accepted A3 registration/login, A4 recovery and #63 helper suites are not rerun.
- Workflow `phone-recaptcha-ui.yml` targets only this PR's base, uses no database,
  and uploads its HTML report/screenshots/traces. No real SMS or device is used.

This closes the previously recorded A3 screen integration prerequisite. Existing
A2/A3/A4 dependency integration and release/security/real-SMS/physical-device
acceptance prerequisites remain. Feature flags stay off. No production/main,
staging deployment, live migration, APK, Admin or PR merge is performed. Stop at
this task's handover.
