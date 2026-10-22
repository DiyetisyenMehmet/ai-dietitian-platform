#!/usr/bin/env bash
# The manager accepted this exact launch implementation and its 44 checks.
# An allowlisted artwork-only delta needs pixel/resource checks + recordings,
# not another run of unchanged web, auth/cookie and lifecycle scenarios.
set -euo pipefail
accepted_launch_sha=38bcd6f52fb2dfa805c18da5b4411bd471e4d80d
launch_revision="${1:-HEAD}"
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
