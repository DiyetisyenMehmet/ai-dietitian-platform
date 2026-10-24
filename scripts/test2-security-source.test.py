"""Fail-closed checks against pinned real Git objects; no network or database."""
import importlib.util
import json
import os
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
        self.harness_ref = os.environ.get('G1_TEST_HARNESS_REF') or r.text(REPO, 'rev-parse', 'HEAD')
        env = patch.dict(os.environ, {'G1_TEST_HARNESS_REF': self.harness_ref})
        env.start()
        self.addCleanup(env.stop)

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

    def test_only_five_accepted_mascot_files_join_eight_security_files(self):
        manifest = self.prepared()
        self.assertEqual(len(r.PINS), 13)
        self.assertEqual(len(r.MASCOT_PINS), 5)
        self.assertEqual(manifest['format'], 3)
        self.assertEqual(manifest['collectionCommit'], r.COLLECTION)
        for path in r.MASCOT_PINS:
            self.assertEqual((self.output / path).read_bytes(), r.git(REPO, 'show', r.COLLECTION + ':' + path))
        for path in ['backend/prisma/schema.prisma', 'backend/src/modules/account/account.service.ts',
                     'backend/src/modules/admin/admin.routes.ts', 'backend/src/utils/jwt.ts',
                     'backend/scripts/app11-migration-check.mjs']:
            self.assertEqual((self.output / path).read_bytes(), r.git(REPO, 'show', r.BASE + ':' + path))
        self.assertEqual(len(list((self.output / 'backend/prisma/migrations').glob('*/migration.sql'))), 52)
        self.assertFalse((self.output / 'backend/src/modules/admin/admin-system.service.ts').exists())

    def test_unapproved_collection_reference_or_blob_is_rejected(self):
        with patch.object(r, 'COLLECTION', r.BASE):
            with self.assertRaisesRegex(RuntimeError, 'source policy mismatch'):
                self.prepared()
        with patch.dict(r.MASCOT_PINS, {'backend/src/modules/account/account.schemas.ts': '0' * 40}):
            with self.assertRaisesRegex(RuntimeError, 'source policy mismatch'):
                self.prepared()
        self.assertFalse(self.output.exists())

    def test_wrong_security_blob_stops_before_output(self):
        with patch.dict(r.PINS, {'backend/package.json': '0' * 40}):
            with self.assertRaisesRegex(RuntimeError, 'source policy mismatch'):
                self.prepared()
        self.assertFalse(self.output.exists())

    def test_unavailable_base_fails_closed(self):
        with patch.object(r, 'BASE', '0' * 40):
            with self.assertRaises(RuntimeError):
                self.prepared()
        self.assertFalse(self.output.exists())

    def temporary_repo(self):
        repo = self.root / 'synthetic-repo'
        r.git(REPO, 'clone', '--shared', '--no-checkout', str(REPO), str(repo))
        r.git(repo, 'checkout', '--detach', self.harness_ref)
        return repo

    def commit_fixture(self, repo, path, content):
        target = repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        r.git(repo, 'add', '--', path)
        r.git(repo, '-c', 'user.name=G1 Synthetic', '-c', 'user.email=synthetic@example.invalid',
              'commit', '--no-gpg-sign', '-m', 'Synthetic coordinated staging regression')

    def test_later_unrelated_product_commit_keeps_identical_source_manifest(self):
        original_head = r.text(REPO, 'rev-parse', 'HEAD')
        original_index = r.git(REPO, 'ls-files', '--stage')
        repo = self.temporary_repo()
        first = r.prepare(repo, self.root / 'before')
        app = 'backend/src/app.ts'
        self.commit_fixture(repo, app, (repo / app).read_text() + '\n// Synthetic later product change\n')
        self.commit_fixture(repo, 'frontend/unrelated-coordination.txt', 'Synthetic team feature\n')
        self.assertNotEqual(r.text(repo, 'rev-parse', 'HEAD'), self.harness_ref)
        second = r.prepare(repo, self.root / 'after')
        self.assertEqual(r.encoded(first), r.encoded(second))
        self.assertEqual((self.root / 'before/source-manifest.json').read_bytes(),
                         (self.root / 'after/source-manifest.json').read_bytes())
        self.assertEqual(r.verify(repo, self.root / 'before'), first)
        self.assertEqual((self.root / 'after' / app).read_bytes(), r.git(REPO, 'show', r.BASE + ':' + app))
        self.assertEqual(original_head, r.text(REPO, 'rev-parse', 'HEAD'))
        self.assertEqual(original_index, r.git(REPO, 'ls-files', '--stage'))

    def test_later_committed_or_uncommitted_harness_change_is_rejected(self):
        repo = self.temporary_repo()
        harness = 'scripts/test2-security-runtime.test.cjs'
        self.commit_fixture(repo, harness, (repo / harness).read_text() + '\n// Unapproved harness change\n')
        with self.assertRaisesRegex(RuntimeError, 'harness content drift'):
            r.prepare(repo, self.output)
        self.assertFalse(self.output.exists())
        r.git(repo, 'reset', '--hard', self.harness_ref)
        path = repo / 'scripts/test2-security-source.test.py'
        path.write_text(path.read_text() + '\n# Uncommitted harness change\n')
        with self.assertRaisesRegex(RuntimeError, 'harness worktree drift'):
            r.prepare(repo, self.output)
        self.assertFalse(self.output.exists())

    def test_extra_security_source_pin_or_output_file_is_rejected(self):
        extra = 'backend/src/app.ts'
        with patch.dict(r.PINS, {extra: r.text(REPO, 'rev-parse', r.REVIEWED + ':' + extra)}):
            with self.assertRaisesRegex(RuntimeError, 'source policy mismatch'):
                self.prepared()
        self.prepared()
        (self.output / 'backend/src/unapproved-security.ts').write_text('// not reviewed\n')
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            r.verify(REPO, self.output)

    def test_harness_reference_must_be_explicit_and_immutable(self):
        for ref in ['', 'HEAD', 'feature/staging-preview', '0' * 40]:
            with self.subTest(ref=ref), self.assertRaises(RuntimeError):
                r.prepare(REPO, self.output, harness_ref=ref)
        with patch.dict(os.environ, {'G1_TEST_HARNESS_REF': ''}):
            with self.assertRaisesRegex(RuntimeError, 'explicit immutable'):
                self.prepared()
        self.assertFalse(self.output.exists())

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
