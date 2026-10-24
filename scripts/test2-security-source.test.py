"""Fail-closed checks against pinned real Git objects; no network or database."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('compose', Path(__file__).with_name('test2-security-source.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
REPO = Path(__file__).resolve().parents[1]


class SourceGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='g1-source-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / 'composed'

    def prepared(self):
        return r.prepare(REPO, self.output)

    def test_deterministic_source_and_original_index_unchanged(self):
        before = r.git(REPO, 'ls-files', '--stage')
        head = r.text(REPO, 'rev-parse', 'HEAD')
        first = self.prepared()
        second = r.prepare(REPO, self.root / 'second')
        self.assertEqual(first, second)
        self.assertEqual(first['allowedBlobs'], r.PINS)
        self.assertEqual(first['versions'], r.VERSIONS)
        self.assertEqual(before, r.git(REPO, 'ls-files', '--stage'))
        self.assertEqual(head, r.text(REPO, 'rev-parse', 'HEAD'))
        self.assertEqual(r.verify(REPO, self.output), first)

    def test_prisma_account_and_excluded_feature_files_stay_at_base(self):
        manifest = self.prepared()
        for path in ['backend/prisma/schema.prisma', 'backend/src/modules/account/account.schemas.ts',
                     'backend/src/modules/account/account.repository.ts', 'backend/src/utils/jwt.ts']:
            self.assertEqual((self.output / path).read_bytes(), r.git(REPO, 'show', r.BASE + ':' + path))
        migrations = [p for p in manifest['excludedChanges'] if '/prisma/migrations/' in p]
        self.assertEqual(len(migrations), 2)
        for path in migrations:
            self.assertFalse((self.output / path).exists())

    def test_wrong_security_blob_stops_before_output(self):
        with patch.dict(r.PINS, {'backend/package.json': '0' * 40}):
            with self.assertRaisesRegex(RuntimeError, 'blob mismatch'):
                self.prepared()
        self.assertFalse(self.output.exists())

    def test_unavailable_base_fails_closed(self):
        with patch.object(r, 'BASE', '0' * 40):
            with self.assertRaises(RuntimeError):
                self.prepared()
        self.assertFalse(self.output.exists())

    def test_preparation_application_drift_rejected(self):
        original = r.text
        def drift(repo, *args, **kwargs):
            if args[:3] == ('diff', '--name-only', r.REVIEWED):
                return 'backend/src/app.ts'
            return original(repo, *args, **kwargs)
        with patch.object(r, 'text', side_effect=drift):
            with self.assertRaisesRegex(RuntimeError, 'application drift'):
                self.prepared()

    def test_output_inside_repo_or_existing_output_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'outside repository'):
            r.prepare(REPO, REPO / 'must-not-create')
        self.output.mkdir()
        with self.assertRaisesRegex(RuntimeError, 'already exists'):
            self.prepared()

    def test_manifest_edit_rejected(self):
        self.prepared()
        path = self.output / 'source-manifest.json'
        manifest = json.loads(path.read_text())
        manifest['securityCommit'] = r.BASE
        path.write_bytes(r.encoded(manifest))
        with self.assertRaisesRegex(RuntimeError, 'provenance mismatch'):
            r.verify(REPO, self.output)

    def test_lock_modification_rejected(self):
        self.prepared()
        path = self.output / 'backend/package-lock.json'
        lock = json.loads(path.read_text())
        lock['packages']['node_modules/zod']['version'] = '3.24.1'
        path.write_text(json.dumps(lock))
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            r.verify(REPO, self.output)

    def test_added_migration_rejected(self):
        self.prepared()
        (self.output / 'backend/prisma/injected.sql').write_text('SELECT 1;')
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            r.verify(REPO, self.output)

    def test_missing_source_rejected(self):
        self.prepared()
        (self.output / 'backend/src/app.ts').unlink()
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            r.verify(REPO, self.output)

    def test_executable_mode_drift_rejected(self):
        self.prepared()
        (self.output / 'backend/src/app.ts').chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            r.verify(REPO, self.output)

    def test_symlink_rejected(self):
        self.prepared()
        path = self.output / 'backend/src/app.ts'
        path.unlink()
        path.symlink_to(REPO / 'backend/src/app.ts')
        with self.assertRaisesRegex(RuntimeError, 'symlink'):
            r.verify(REPO, self.output)

    def test_installed_check_ignores_only_generated_paths_and_still_checks_source(self):
        self.prepared()
        generated = self.output / 'backend/node_modules'
        generated.mkdir()
        (generated / 'synthetic').write_text('generated')
        with self.assertRaises(RuntimeError):
            r.verify(REPO, self.output)
        r.verify(REPO, self.output, installed=True)
        (self.output / 'backend/src/app.ts').write_text('changed source')
        with self.assertRaises(RuntimeError):
            r.verify(REPO, self.output, installed=True)

    def test_source_root_and_manifest_symlinks_rejected(self):
        self.prepared()
        alias = self.root / 'alias'
        alias.symlink_to(self.output, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'root symlink'):
            r.verify(REPO, alias)
        manifest = self.output / 'source-manifest.json'
        saved = self.root / 'manifest.json'
        manifest.rename(saved)
        manifest.symlink_to(saved)
        with self.assertRaisesRegex(RuntimeError, 'manifest symlink'):
            r.verify(REPO, self.output)

    def test_ci_database_boundary(self):
        good = 'postgresql://diewish:diewish@127.0.0.1:5432/g1_test2_source?schema=public'
        r.validate_ci_database(good)
        for bad in [good.replace('127.0.0.1', 'db.neon.tech'), good.replace('g1_test2_source', 'real'),
                    good.replace('diewish:diewish', 'real:credential'), good.replace(':5432', ':5433'), good + '#extra', '']:
            with self.subTest(url=bad), self.assertRaises(RuntimeError):
                r.validate_ci_database(bad)

    def test_future_start_rejects_migrations_shells_and_live_tags(self):
        r.validate_future_start(['npm', 'start'], 'test2-zod-a1', ['mascot-candidate'])
        for command in [[], ['npm', 'run', 'start:migrate'], ['sh', '-c', 'npm start'], ['npm', 'start', '--', 'migrate']]:
            with self.subTest(command=command), self.assertRaises(RuntimeError):
                r.validate_future_start(command, 'test2-zod-a1', [])
        for tag in ['diewish-test2', 'admin-legacy', 'mascot-candidate', 'a' * 40, '../unsafe', 'ends-']:
            with self.subTest(tag=tag), self.assertRaises(RuntimeError):
                r.validate_future_start(['npm', 'start'], tag, ['mascot-candidate'])


if __name__ == '__main__':
    unittest.main()
