#!/usr/bin/env bash
# The manager accepted this exact launch implementation and its 44 checks.
# An allowlisted artwork-only delta needs pixel/resource checks + recordings,
# not another run of unchanged web, auth/cookie and lifecycle scenarios.
set -euo pipefail
accepted_launch_sha=38bcd6f52fb2dfa805c18da5b4411bd471e4d80d
launch_revision="${1:-HEAD}"
# Follow-up approved in PR #94 comment-6350518311. Inspect only this PR's
# merge-base delta so other workers' staging changes are never attributed here.
brand_base="${2:-17561661d816627d009a9eeb3405d70549f933dc}"
if git merge-base --is-ancestor 17561661d816627d009a9eeb3405d70549f933dc "$launch_revision"; then
  brand_changes="$(git diff --name-only "$brand_base...$launch_revision")"
  brand_assets=true
  [ -n "$brand_changes" ] || brand_assets=false
  while IFS= read -r brand_path; do
    case "$brand_path" in
      frontend/public/brands/diewish-id-transparent-approved.png|\
      frontend/public/brands/diewish-wordmark-dark-approved.png|\
      frontend/src/presentation/components/branding/brand-lockup.tsx|\
      frontend/src/presentation/components/branding/brand-lockup.module.css|\
      frontend/e2e/launch-flow.spec.ts|\
      frontend/e2e/auth-brand-header-alignment.spec.ts|\
      frontend/e2e/approved-brand-assets.spec.ts|\
      frontend/playwright.approved-brand.config.ts|\
      android/app/src/main/res/drawable-nodpi/diewish_splash_rounded.png|\
      scripts/branding/generate_launch_icon.py|\
      scripts/branding/test_launch_icon.py|\
      scripts/branding/launch_revision_scope.sh|\
      docs/verification/APP11-APPROVED-DARK-BRAND-ASSETS-A2.md|\
      .github/workflows/android-launch-flow-polish.yml|\
      .github/workflows/auth-brand-header-alignment.yml) ;;
      *) brand_assets=false; break ;;
    esac
  done <<< "$brand_changes"
  if [ "$brand_assets" = true ]; then
    echo 'artwork_only=false'
    echo 'brand_assets=true'
    exit 0
  fi
fi
echo 'brand_assets=false'
if ! git merge-base --is-ancestor "$accepted_launch_sha" "$launch_revision"; then
  echo 'artwork_only=false'
  exit 0
fi
launch_changed_files="$(git diff --name-only "$accepted_launch_sha" "$launch_revision")"
if [ -z "$launch_changed_files" ]; then
  echo 'artwork_only=false'
  exit 0
fi
while IFS= read -r launch_path; do
  case "$launch_path" in
    android/app/src/main/res/drawable-nodpi/diewish_splash_rounded.png|\
    android/app/src/test/java/com/diewish/app/LaunchPresentationTest.java|\
    scripts/branding/generate_launch_icon.py|\
    scripts/branding/test_launch_icon.py|\
    scripts/branding/launch_revision_scope.sh|\
    docs/verification/APP11-ANDROID-LAUNCH-FLOW-A1.md|\
    .github/workflows/android-launch-flow-polish.yml|\
    .github/workflows/auth-brand-header-alignment.yml) ;;
    *) echo 'artwork_only=false'; exit 0 ;;
  esac
done <<< "$launch_changed_files"
echo 'artwork_only=true'
