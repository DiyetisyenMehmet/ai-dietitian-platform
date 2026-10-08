"""Bound expensive runtime jobs to relevant changes; no secrets are read."""
import json
import os
import subprocess
from pathlib import Path

event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
before = event.get("before", "")
if before and before != "0" * 40:
    subprocess.run(["git", "fetch", "--depth=1", "origin", before], check=True, stdout=subprocess.DEVNULL)
    files = subprocess.check_output(["git", "diff", "--name-only", before, "HEAD"], text=True).splitlines()
else:
    files = subprocess.check_output(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], text=True).splitlines()
common = any(p in {".github/workflows/crossplatform-qa-infra.yml", "qa/platform/contract.cjs", "qa/platform/verify-artifacts.cjs", "qa/platform/account-preflight.cjs"} for p in files)
web = common or any(p.startswith("frontend/") or p in {"qa/platform/runtime.cjs", "qa/platform/scenarios.json"} for p in files)
android = common or any(p.startswith("android/") or p in {"qa/platform/runtime.cjs", "qa/platform/scenarios.json"} for p in files)
ios = common or any(p.startswith("ios/") or p.startswith("frontend/") or p.startswith("qa/platform/ios-") or p == "qa/platform/ios-private.py" for p in files)
with open(os.environ["GITHUB_OUTPUT"], "a") as output:
    for key, value in {"web": web, "android": android, "ios": ios}.items():
        print(f"{key}={str(value).lower()}", file=output)
