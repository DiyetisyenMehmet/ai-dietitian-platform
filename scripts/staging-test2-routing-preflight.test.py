import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name('staging-test2-routing-preflight.py')
spec = importlib.util.spec_from_file_location('preflight', path)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class Preflight(unittest.TestCase):
    def test_snapshot_redacts_payloads_and_retains_rollback_references(self):
        snapshot = preflight.revision_snapshot({
            'metadata': {'name': 'old-revision'}, 'status': {'imageDigest': 'sha256:synthetic'},
            'spec': {'serviceAccountName': preflight.RUNTIME, 'containers': [{'image': 'test-image', 'env': [
                {'name': 'DATABASE_URL', 'valueFrom': {'secretKeyRef': {'name': 'old-secret', 'key': '7'}}},
                {'name': 'SMTP_PASSWORD', 'value': 'must-never-appear'},
                {'name': 'FIREBASE_PRIVATE_KEY', 'value': 'private-must-never-appear'},
                {'name': 'DIEWISH_APPLICATION_SHA', 'value': 'a' * 40},
            ]}]}})
        import json
        encoded = json.dumps(snapshot)
        self.assertNotIn('must-never-appear', encoded)
        self.assertEqual(snapshot['secretReferences']['DATABASE_URL'], {'secret': 'old-secret', 'referenceVersion': '7'})
        self.assertEqual(snapshot['smtpPresence']['SMTP_PASSWORD'], 'VAR')
        self.assertEqual(snapshot['smtpPresence']['SMTP_HOST'], 'YOK')

    def test_commands_are_metadata_reads_only(self):
        calls = []
        def read(*args):
            calls.append(args)
            if args[:3] == ('run', 'services', 'describe'):
                return {'status': {'url': 'https://synthetic.invalid', 'traffic': [{'revisionName': args[3] + '-old', 'percent': 100}]}}
            if args[:3] == ('run', 'revisions', 'describe'):
                return {'metadata': {'name': args[3]}, 'spec': {'containers': [{'image': 'test', 'env': []}]}}
            if args[:3] == ('scheduler', 'jobs', 'list'):
                return [{'name': 'projects/test/jobs/diewish-notification-dispatch-staging', 'state': 'PAUSED'}]
            if args[0] == 'beta':
                return {'spec': {'routeName': preflight.FRONTEND}}
            raise RuntimeError('metadata unavailable')
        original = preflight.read
        preflight.read = read
        try:
            result = preflight.collect()
        finally:
            preflight.read = original
        self.assertEqual(result['mode'], 'READ_ONLY_NOT_DEPLOYED')
        self.assertEqual(result['schedulers'][0]['state'], 'PAUSED')
        for call in calls:
            self.assertTrue('describe' in call or 'list' in call or 'get-iam-policy' in call)
            self.assertFalse(set(call) & {'access', 'update', 'deploy', 'create', 'delete', 'resume', 'run', 'pause'} - {'run'})
        self.assertTrue(result['decision'].startswith('NO_GO'))


if __name__ == '__main__':
    unittest.main()
