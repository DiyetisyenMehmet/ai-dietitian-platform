import importlib.util
import os
import plistlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ios_private", Path(__file__).with_name("ios-private.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PrivateTests(unittest.TestCase):
    def test_environment_injection_and_path_relocation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build = root / "build"
            products = build / "Build/Products"
            products.mkdir(parents=True)
            data = {"TestConfigurations": [{"TestTargets": [{"TestBundlePath": "__TESTROOT__/Test.xctest", "UITargetAppPath": "__TESTROOT__/App.app"}]}]}
            with (products / "qa.xctestrun").open("wb") as stream:
                plistlib.dump(data, stream)
            with patch.dict(os.environ, {"QA_EMAIL": "synthetic@example.invalid", "QA_PASSWORD": "ephemeral", "QA_SYNTHETIC_ACCOUNT": "YES"}):
                module.inject(build)
            with (root / "qa.xctestrun").open("rb") as stream:
                result = plistlib.load(stream)
            target = result["TestConfigurations"][0]["TestTargets"][0]
            self.assertEqual(target["EnvironmentVariables"]["QA_PASSWORD"], "ephemeral")
            self.assertEqual(target["UITestingEnvironmentVariables"]["QA_EMAIL"], "synthetic@example.invalid")
            self.assertTrue(target["TestBundlePath"].startswith(str(products)))
            self.assertEqual((root / "qa.xctestrun").stat().st_mode & 0o777, 0o600)

if __name__ == "__main__":
    unittest.main()
