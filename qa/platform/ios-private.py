"""Private Xcode environment material; never print credentials or persist in artifacts."""
import os
import plistlib
import sys
from pathlib import Path

SECRET_KEYS = ("QA_EMAIL", "QA_PASSWORD", "QA_SYNTHETIC_ACCOUNT", "QA_ACCOUNT_ID", "QA_ACCOUNT_HMAC_KEY")

def inject(directory):
    files = list(Path(directory).glob("Build/Products/*.xctestrun"))
    if len(files) != 1:
        raise RuntimeError("ONE_XCTESTRUN_REQUIRED")
    with files[0].open("rb") as stream:
        document = plistlib.load(stream)
    def visit(value):
        if isinstance(value, dict):
            if "TestBundlePath" in value:
                env = {key: os.environ[key] for key in SECRET_KEYS if key in os.environ}
                for field in ("EnvironmentVariables", "UITestingEnvironmentVariables"):
                    value.setdefault(field, {}).update(env)
            for child in list(value.values()):
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(document)
    # Absolute locations stay valid after the xctestrun moves one directory up.
    def paths(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if isinstance(child, str):
                    value[key] = child.replace("__TESTROOT__", str(files[0].parent.resolve()))
                else:
                    paths(child)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                if isinstance(child, str):
                    value[index] = child.replace("__TESTROOT__", str(files[0].parent.resolve()))
                else:
                    paths(child)
    paths(document)
    out = Path(directory).parent / "qa.xctestrun"
    with out.open("wb") as stream:
        plistlib.dump(document, stream)
    out.chmod(0o600)

if __name__ == "__main__":
    if sys.argv[1] != "inject":
        raise SystemExit("UNSUPPORTED_OPERATION")
    inject(sys.argv[2])
