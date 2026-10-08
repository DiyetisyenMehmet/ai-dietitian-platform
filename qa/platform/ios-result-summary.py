"""Print sanitized XCTest failure reasons only; raw actions remain private."""
import json
import os
import re
import subprocess
import sys
result = subprocess.run(["xcrun", "xcresulttool", "get", "test-results", "summary", "--path", sys.argv[1]], capture_output=True, text=True)
if result.returncode == 0:
    document = json.loads(result.stdout)
    for failure in document.get("testFailures", []):
        message = str(failure.get("failureText", failure.get("message", "XCTEST_FAILED")))
        for key in ("QA_EMAIL", "QA_PASSWORD", "QA_ACCOUNT_ID", "QA_ACCOUNT_HMAC_KEY"):
            secret = os.environ.get(key)
            if secret:
                message = message.replace(secret, "[REDACTED]")
        message = re.sub(r'[\w.+-]+@[\w.-]+|Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+', '[REDACTED]', message)
        print("XCTEST_FAILURE:", message[:500])
