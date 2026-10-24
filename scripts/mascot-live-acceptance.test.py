import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

# No sockets, database, registration or deletion: every request uses Client below.
spec = importlib.util.spec_from_file_location('acceptance', Path(__file__).with_name('mascot-live-acceptance.py'))
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)

class Client:
    def __init__(self, fail=None, deletion=None, revoked_status=401):
        self.identity = 'classic'
        self.calls = []
        self.requests = []
        self.identities = []
        self.fail = fail
        self.deletion = deletion if deletion is not None else {
            'deletionRequestedAt': '2026-10-22T00:00:00Z',
            'purgeEligibleAt': '2026-11-21T00:00:00Z', 'graceDays': 30}
        self.deletion_requested = False
        self.revoked_status = revoked_status

    def open(self, request, timeout):
        path = request.full_url.split('/api', 1)[1]
        method = request.get_method()
        self.calls.append((method, path))
        self.requests.append(request)
        if path == self.fail:
            raise urllib.error.HTTPError(request.full_url, 409, 'private body', {}, io.BytesIO(b'private-secret'))
        if path == '/auth/refresh-token' and self.deletion_requested and self.revoked_status != 200:
            raise urllib.error.HTTPError(request.full_url, self.revoked_status, 'private body', {}, io.BytesIO(b'private-secret'))
        if path == '/account/mascot':
            if method == 'PATCH':
                self.identity = json.loads(request.data)['mascotId']
                self.identities.append(self.identity)
            data = {'preferences': {'mascotId': self.identity}}
        elif path == '/account/deletion/request':
            self.deletion_requested = True
            data = self.deletion
        else:
            data = {'tokens': {'accessToken': 'synthetic-only'}}
        return io.BytesIO(json.dumps({'success': True, 'data': data}).encode())

class CleanupContract(unittest.TestCase):
    def invoke(self, client):
        with patch.object(acceptance.urllib.request, 'build_opener', return_value=client), \
                patch('sys.stdout', new_callable=io.StringIO) as output, \
                patch('sys.stderr', new_callable=io.StringIO) as errors:
            status = acceptance.main(['https://staging.diewish.com'])
        logs = output.getvalue() + errors.getvalue()
        for secret in ['private-secret', 'private body', 'synthetic-only', 'Authorization', 'Set-Cookie']:
            self.assertNotIn(secret, logs)
        for request in client.requests:
            data = json.loads(request.data) if request.data else {}
            for field in ['password', 'email']:
                if field in data:
                    self.assertNotIn(data[field], logs)
        self.assertFalse(any(method == 'DELETE' for method, _ in client.calls))
        return status, logs

    def test_uses_deletion_request_without_bypassing_grace(self):
        client = Client()
        status, logs = self.invoke(client)
        self.assertEqual(status, 0)
        self.assertEqual(len(client.identities), 16)
        self.assertEqual(client.identities, acceptance.IDS)
        self.assertEqual(len(set(client.identities)), 16)
        self.assertEqual(client.calls.count(('POST', '/account/deletion/request')), 1)
        self.assertEqual(client.calls[-1], ('POST', '/auth/refresh-token'))
        self.assertIsNone(client.requests[-1].get_header('Authorization'))
        self.assertIn('permanent purge PENDING', logs)
        self.assertNotIn('account deleted', logs)
        self.assertIn(('POST', '/auth/logout'), client.calls)
        self.assertIn(('POST', '/auth/login'), client.calls)
        registered = json.loads(client.requests[0].data)
        self.assertTrue(registered['email'].startswith('mascot.release.'))
        self.assertTrue(registered['email'].endswith('@example.invalid'))
        cleanup = next(r for r in client.requests if r.full_url.endswith('/account/deletion/request'))
        self.assertEqual(json.loads(cleanup.data), {'password': registered['password']})
        self.assertEqual(cleanup.get_header('Authorization'), 'Bearer synthetic-only')

    def test_cleanup_failure_stays_failed_and_diagnostic_is_sanitized(self):
        status, logs = self.invoke(Client('/account/deletion/request'))
        self.assertEqual(status, 1)
        self.assertIn('POST /account/deletion/request: HTTP 409', logs)
        self.assertNotIn('permanent purge PENDING', logs)

    def test_failed_preference_probe_still_requests_cleanup(self):
        client = Client('/account/mascot')
        status, logs = self.invoke(client)
        self.assertEqual(status, 1)
        self.assertIn(('POST', '/account/deletion/request'), client.calls)
        self.assertIn('GET /account/mascot: HTTP 409', logs)
        self.assertIn('permanent purge PENDING', logs)

    def test_failures_during_refresh_logout_or_login_still_request_cleanup(self):
        for path in ['/auth/refresh-token', '/auth/logout', '/auth/login']:
            with self.subTest(path=path):
                client = Client(path)
                status, _ = self.invoke(client)
                self.assertEqual(status, 1)
                self.assertEqual(client.calls.count(('POST', '/account/deletion/request')), 1)

    def test_invalid_deletion_confirmation_is_not_reported_as_success(self):
        valid = Client().deletion
        invalid = [{}, {'graceDays': 30}]
        for field, values in {
            'graceDays': [True, -1, 30.0, '30', 31],
            'deletionRequestedAt': [None, '', 'private-secret', '2026-10-22'],
            'purgeEligibleAt': [None, '', '2026-10-21T00:00:00Z', '2026-11-21'],
        }.items():
            invalid.extend({**valid, field: value} for value in values)
        for data in invalid:
            with self.subTest(data=data):
                status, logs = self.invoke(Client(deletion=data))
                self.assertEqual(status, 1)
                self.assertNotIn('permanent purge PENDING', logs)

    def test_configured_zero_day_grace_still_means_pending_not_purged(self):
        status, logs = self.invoke(Client(deletion={
            'deletionRequestedAt': '2026-10-22T00:00:00Z',
            'purgeEligibleAt': '2026-10-22T00:00:00Z', 'graceDays': 0}))
        self.assertEqual(status, 0)
        self.assertIn('permanent purge PENDING', logs)

    def test_missing_revocation_or_unexpected_error_cannot_pass(self):
        for response in [200, 403, 500]:
            with self.subTest(response=response):
                status, logs = self.invoke(Client(revoked_status=response))
                self.assertEqual(status, 1)
                self.assertNotIn('refresh sessions revoked', logs)

    def test_registration_failure_never_attempts_another_accounts_cleanup(self):
        client = Client('/auth/register')
        status, _ = self.invoke(client)
        self.assertEqual(status, 1)
        self.assertEqual(client.calls, [('POST', '/auth/register')])

    def test_unapproved_hosts_and_historical_candidate_stop_before_requests(self):
        targets = ['https://diewish.com', 'http://staging.diewish.com',
                   'https://staging.diewish.com.evil.invalid', 'https://staging.diewish.com:8443',
                   'https://staging.diewish.com/?token=private-secret',
                   'https://mascot-candidate---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app']
        for target in targets:
            with self.subTest(target=target), \
                    patch.object(acceptance.urllib.request, 'build_opener') as opener, \
                    patch('sys.stderr', new_callable=io.StringIO) as errors:
                self.assertEqual(acceptance.main([target]), 1)
                opener.assert_not_called()
                self.assertNotIn('private-secret', errors.getvalue())

    def test_non_http_failure_does_not_print_exception_or_response_content(self):
        class Broken(Client):
            def open(self, request, timeout):
                if request.full_url.endswith('/account/mascot'):
                    raise ValueError('private-secret Set-Cookie synthetic-only')
                return super().open(request, timeout)
        client = Broken()
        status, logs = self.invoke(client)
        self.assertEqual(status, 1)
        self.assertIn('NO_GO: synthetic mascot acceptance failed', logs)
        self.assertIn(('POST', '/account/deletion/request'), client.calls)

if __name__ == '__main__':
    unittest.main()
