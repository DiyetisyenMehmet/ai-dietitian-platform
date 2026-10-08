"""Print only sanitized compiler diagnostics; never export raw Xcode/UI-test logs."""
import os
import re
import sys
from pathlib import Path
secrets = [os.environ.get(k) for k in ("QA_EMAIL", "QA_PASSWORD", "QA_ACCOUNT_ID", "QA_ACCOUNT_HMAC_KEY") if os.environ.get(k)]
for line in Path(sys.argv[1]).read_text(errors="replace").splitlines():
    if not re.search(r'error:|BUILD FAILED|build commands failed', line):
        continue
    for secret in secrets:
        line = line.replace(secret, "[REDACTED]")
    line = re.sub(r'[\w.+-]+@[\w.-]+', '[REDACTED]', line)
    line = re.sub(r'Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+', '[REDACTED]', line)
    print(line[:600])
