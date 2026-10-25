# Diewish staging Android test APK build request

Date: 2026-10-25
Approved by project owner: build a staging test APK now.
Requested source baseline: f409788042c59362bf32ad95a5abba650e1f0bc2
Workflow: .github/workflows/staging-notification-test-apk.yml
Purpose: build only an Android debug APK, configured for https://staging.diewish.com, with verified staging Firebase and Google OAuth settings.
Permissions: no production, no Cloud Run backend/frontend release, no database changes/migrations, no user-account writes, no traffic switches, no app-store distribution.
This request is a test package build, **not** evidence of end-to-end product readiness or Final QA.
The signed test package SHA, artifact link, test results and current staging service conditions must be verified before user acceptance.
If build configuration preflight fails, keep NO-GO and do not silently weaken staging identity/FCM/Google sign-in checks.
