import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('acceptance', Path(__file__).with_name('mascot-live-acceptance.py'))
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)

class Client:
    def __init__(self, fail=None):
        self.identity = 'classic'
        self.calls = []
        self.fail = fail

    def open(self, request, timeout):
        path = request.full_url.split('/api', 1)[1]
        method = request.get_method()
        self.calls.append((method, path))
        if path == self.fail:
            raise urllib.error.HTTPError(request.full_url, 409, 'private body', {}, io.BytesIO(b'private-secret'))
        if path == '/account/mascot':
            if method == 'PATCH':
                self.identity = json.loads(request.data)['mascotId']
            data = {'preferences': {'mascotId': self.identity}}
        elif path == '/account/deletion/request':
            data = {'deletionRequestedAt': '2026-10-22T00:00:00Z', 'purgeEligibleAt': '2026-11-21T00:00:00Z', 'graceDays': 30}
        else:
            data = {'tokens': {'accessToken': 'synthetic-only'}}
        return io.BytesIO(json.dumps({'success': True, 'data': data}).encode())

class CleanupContract(unittest.TestCase):
    def test_uses_deletion_request_without_bypassing_grace(self):
        client = Client()
        with patch.object(acceptance.urllib.request, 'build_opener', return_value=client), patch('sys.stdout', new_callable=io.StringIO) as output:
            acceptance.run('https://staging.diewish.com')
        self.assertEqual(client.calls.count(('POST', '/account/deletion/request')), 1)
        self.assertFalse(any(method == 'DELETE' for method, _ in client.calls))
        self.assertIn('permanent purge PENDING', output.getvalue())
        self.assertNotIn('account deleted', output.getvalue())

    def test_cleanup_failure_stays_failed_and_diagnostic_is_sanitized(self):
        with patch.object(acceptance.urllib.request, 'build_opener', return_value=Client('/account/deletion/request')):
            with self.assertRaises(acceptance.AcceptanceHttpError) as error:
                acceptance.run('https://staging.diewish.com')
        self.assertEqual(str(error.exception), 'POST /account/deletion/request: HTTP 409')
        self.assertNotIn('private', str(error.exception))

    def test_failed_preference_probe_still_requests_cleanup(self):
        client = Client('/account/mascot')
        with patch.object(acceptance.urllib.request, 'build_opener', return_value=client):
            with self.assertRaises(acceptance.AcceptanceHttpError):
                acceptance.run('https://staging.diewish.com')
        self.assertEqual(client.calls[-1], ('POST', '/account/deletion/request'))

if __name__ == '__main__':
    unittest.main()
