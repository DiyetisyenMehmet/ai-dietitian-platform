"""Exercise staging Android config with synthetic, read-only API replies.

Run: python3 scripts/android-google-config.test.py (requires PyYAML).
No cloud requests, APKs, project changes or actual credentials are used.
"""
import copy
import json
import os
import subprocess
import tempfile
from pathlib import Path

import yaml

repo = Path(__file__).resolve().parents[1]
workflow = yaml.safe_load((repo / ".github/workflows/staging-preview.yml").read_text())
step = next(
    step
    for job in workflow["jobs"].values()
    for step in job.get("steps", [])
    if step.get("name") == "Resolve staging Android Firebase config"
)
project = "isolated-staging-project"
sender = "123456"
valid = {
    "project_info": {"project_id": project, "project_number": sender},
    "client": [{
        "client_info": {
            "mobilesdk_app_id": "synthetic-app",
            "android_client_info": {"package_name": "com.diewish.app"},
        },
        "api_key": [{"current_key": "synthetic-key"}],
        "oauth_client": [
            {"client_type": 3, "client_id": "123456-web.apps.googleusercontent.com"},
            {"client_type": 1, "client_id": "123456-android.apps.googleusercontent.com"},
        ],
    }],
}

curl_stub = '''#!/usr/bin/env python3
import base64
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
assert args[-1].startswith('https://firebase.googleapis.com/v1beta1/')
assert '-X' not in args and '--data' not in args
if args[-1].endswith('/androidApps'):
    response = {'apps': [{
        'packageName': 'com.diewish.app',
        'name': 'projects/isolated-staging-project/androidApps/synthetic',
    }]}
else:
    response = {'configFileContents': base64.b64encode(
        Path(os.environ['FIXTURE']).read_bytes()).decode()}
Path(args[args.index('-o') + 1]).write_text(json.dumps(response))
print('200', end='')
'''

for case in ["valid", "missing-web-client", "ambiguous-web-client", "mismatched-project"]:
    fixture = copy.deepcopy(valid)
    if case == "missing-web-client":
        fixture["client"][0]["oauth_client"] = []
    elif case == "ambiguous-web-client":
        fixture["client"][0]["oauth_client"].append({
            "client_type": 3, "client_id": "123456-other.apps.googleusercontent.com",
        })
    elif case == "mismatched-project":
        fixture["project_info"]["project_id"] = "other-project"

    with tempfile.TemporaryDirectory(prefix="app9-workflow-") as directory:
        directory = Path(directory)
        (directory / "fixture.json").write_text(json.dumps(fixture))
        (directory / "gcloud").write_text("#!/bin/sh\nprintf synthetic-credential\n")
        (directory / "curl").write_text(curl_stub)
        (directory / "curl").chmod(0o700)
        (directory / "gcloud").chmod(0o700)
        env = {
            **os.environ,
            "PATH": str(directory) + os.pathsep + os.environ["PATH"],
            "FIXTURE": str(directory / "fixture.json"),
            "PROJECT_ID": project,
            "PROJECT_NUMBER": sender,
            "GITHUB_ENV": str(directory / "github-env"),
        }
        result = subprocess.run(
            ["bash", "-c", step["run"]], env=env, capture_output=True, text=True,
        )
        assert (result.returncode == 0) == (case == "valid"), case
        if case == "valid":
            exported = (directory / "github-env").read_text()
            assert "DIEWISH_GOOGLE_WEB_CLIENT_ID=123456-web.apps.googleusercontent.com" in exported
            assert "123456-android.apps.googleusercontent.com" not in exported
        else:
            assert not (directory / "github-env").exists()
            reason = "identity mismatch" if case == "mismatched-project" else "missing or ambiguous"
            assert reason in result.stderr, case
        print(case + ": PASS")
