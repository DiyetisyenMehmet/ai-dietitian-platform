import importlib.util
import contextlib
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('nutrition-acceptance-log-reader.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class ProjectionTests(unittest.TestCase):
    def test_provider_error_preserves_code_not_sensitive_fields(self):
        row = {'timestamp': '2026-10-15T20:12:00Z', 'jsonPayload': {
            'msg': 'Nutrition plan generation failed', 'elapsedMs': 61000,
            'userId': 'PRIVATE_USER', 'healthConditions': ['PRIVATE_HEALTH'],
            'err': {'code': 'AI_PROVIDER_ERROR', 'message': 'PRIVATE_BODY', 'stack': 'PRIVATE_STACK'},
        }}
        projected = reader.project_entry(row)
        self.assertEqual(projected['code'], 'AI_PROVIDER_ERROR')
        self.assertNotIn('PRIVATE_', json.dumps(projected))

    def test_request_url_headers_and_identity_never_exported(self):
        projected = reader.project_entry({'httpRequest': {
            'requestUrl': 'https://staging.diewish.com/api/nutrition-plans/generate?secret=PRIVATE_SECRET',
            'status': 502, 'latency': '61.25s', 'remoteIp': 'PRIVATE_IP', 'userAgent': 'PRIVATE_AGENT',
        }})
        self.assertEqual(projected, {'event': 'generation-http-response', 'httpStatus': 502, 'latencyMs': 61250})

    def test_raw_text_and_unknown_error_codes_are_not_exported(self):
        self.assertIsNone(reader.project_entry({'textPayload': 'PRIVATE_HEALTH'}))
        self.assertNotIn('code', reader.project_entry({'jsonPayload': {
            'msg': 'Nutrition plan generation failed', 'code': 'PRIVATE_HEALTH'}}))

    def test_serialized_payload_does_not_export_provider_body(self):
        projected = reader.project_entry({'textPayload': json.dumps({
            'msg': 'Vertex AI returned an error', 'status': 503, 'detail': 'PRIVATE_PROVIDER_BODY'})})
        self.assertEqual(projected, {'event': 'provider-http-error', 'status': 503})

    def test_wrong_branch_refused_before_any_cloud_read(self):
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/feature/diagnostics', 'PROJECT_ID': reader.PROJECT}), patch.object(reader, 'read') as command:
            with self.assertRaisesRegex(RuntimeError, 'protected-staging-ref-required'):
                reader.main()
            command.assert_not_called()

    def test_wrong_project_refused_before_any_cloud_read(self):
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/feature/staging-preview', 'PROJECT_ID': 'different-project'}), patch.object(reader, 'read') as command:
            with self.assertRaisesRegex(RuntimeError, 'isolated-staging-project-required'):
                reader.main()
            command.assert_not_called()

    def test_full_reader_uses_only_bounded_read_operations(self):
        def command(*args):
            if args[1:4] == ('run', 'services', 'describe'):
                return {'status': {'traffic': [{'revisionName': args[4], 'percent': 100}]}}
            if args[1:4] == ('run', 'revisions', 'describe'):
                return {'spec': {'containers': [{'env': [
                    {'name': 'NUTRITION_JOBS_ENABLED', 'value': 'false'},
                    {'name': 'DIEWISH_ENVIRONMENT', 'value': 'staging'},
                    {'name': 'DIEWISH_APPLICATION_SHA', 'value': reader.APPROVED_SHA},
                    {'name': 'DATABASE_URL', 'value': 'PRIVATE_DATABASE_SECRET'},
                ]}]}}
            self.assertEqual(args[1:3], ('logging', 'read'))
            self.assertIn('--limit', args)
            self.assertIn('--project', args)
            return [{'jsonPayload': {'msg': 'Nutrition plan generation failed',
                     'err': {'code': 'AI_PROVIDER_ERROR', 'message': 'PRIVATE_HEALTH'}}}]

        output = io.StringIO()
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/feature/staging-preview', 'PROJECT_ID': reader.PROJECT}), patch.object(reader, 'read', side_effect=command), contextlib.redirect_stdout(output):
            reader.main()
        self.assertNotIn('PRIVATE_', output.getvalue())
        reports = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(reports), 4)
        self.assertTrue(reports[0]['runtime']['nutritionExplicitlyDisabled'])
        self.assertEqual([item['window'] for item in reports[2:]], ['first-display', 'second-502'])

    def test_cli_error_body_is_not_exposed(self):
        with patch.object(reader.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stderr='PRIVATE_ERROR', stdout='PRIVATE_BODY')):
            with self.assertRaisesRegex(RuntimeError, '^staging-metadata-read-unavailable$'):
                reader.read('gcloud', 'logging', 'read')


if __name__ == '__main__':
    unittest.main()
