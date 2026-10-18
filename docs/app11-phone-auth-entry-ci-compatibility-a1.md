# APP11-PHONE-AUTH-ENTRY-CI-COMPATIBILITY-A1

Test-only compatibility for staging HEAD
`529b4c15efbd13cf648b18b014606ecdd148abe4`, TREE
`c40679e16478873d9b69eafc23c5b7989526e668`.

## Root cause

Notification platform run 39153567902, frontend-quality job 117752012818:
99/100 browser checks passed. The auth-entry test failed looking for Turkey +90.
Its retained error-context shows the real page's "Giriş seçenekleri yüklenemedi"
alert, not a missing/mislabelled country button. The frontend-only job builds
NEXT_PUBLIC_API_BASE_URL=/api, starts no API/proxy and the old test intercepts no
phone status request. Since A3, PhoneAuthPage waits for GET
/api/identity/phone-password/status. Without a successful status, the safe error
view is expected; increasing the timeout cannot make the country form appear.
The title alone cannot distinguish loading/error from the legacy form.

## Smallest change

No product source changes. The existing auth-entry spec supplies the explicit
success envelope {success:true,data:{enabled:false,pending:false}} before
navigation and waits for loading to end / actual controls to appear. The Google
brand/navigation and Turkey-to-Germany picker assertions remain. Status routes
match same-origin /api and separately hosted API URLs, so the test also works in
Hardening CI with its existing API. Only the two exact feature-status endpoints
are stubbed; there is no wildcard success response masking product errors.

Five targeted cases in that file cover:
1. Flag off: original branded entry, empty phone, SMS button, +90 and +49 picker.
2. Deliberately held status: loading and no actionable auth form until release;
   then the legacy phone entry is shown.
3. HTTP 503: explicit unavailable view, no fallback auth form; successful reload.
4. Network failure: the same safe failure and successful reload behavior.
5. Flag on: shared-password login first; registration switches to SMS number
   entry and its independent badge host; switching back removes the host. No
   SMS send, provider proof, password submission or session is exercised.

Unexpected Firebase/config requests are blocked and fail the test. The spec uses
an import compatible with existing ESLint. Accepted #63/#64/#65 product, helper,
security and reCAPTCHA lifecycle sources stay byte-identical. Their broader
accepted tests and the other 99 browser cases are not rerun by the new workflow.

## Validation and handover

The dedicated workflow uses the same production frontend build, relative /api,
local port and unchanged playwright.notification.config.ts as the failing job,
but selects ONLY e2e/auth-entry-points.spec.js. It runs no API/database, native
Android, real SMS, APK, Admin, deploy or migration operation. Existing workflows
are unchanged. HTML report and any failure traces are retained in Actions.

This PR targets staging for manager review only. No merge/deploy or feature
activation is performed. Other Android/backend CI failures belong to their
assigned workers and are not claimed fixed by this test correction.
