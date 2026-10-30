"""Offline build-input contracts. No Docker, cloud, package install, DB or network calls."""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import yaml

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_context', Path(__file__).with_name('test2-security-build-context.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
REAL_RUN = subprocess.run


@contextlib.contextmanager
def git_objects_only():
    def run(command, *args, **kwargs):
        if command[0] != 'git' or command[3] not in {
            'rev-parse', 'ls-tree', 'show', 'merge-base', 'read-tree', 'update-index', 'write-tree', 'archive', 'diff',
        }:
            raise AssertionError('Only local Git object operations are permitted')
        return REAL_RUN(command, *args, **kwargs)
    with patch('subprocess.run', side_effect=run):
        yield


class BuildInputContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='g1-build-contract-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.ref = r.git(REPO, 'rev-parse', 'HEAD').decode().strip()
        cls.inputs = dict(build_ref=cls.ref, harness_ref=r.HARNESS, manifest_sha256=r.MANIFEST,
                          backend_tree=r.BACKEND, lock_sha256=r.LOCK, image=r.IMAGE_PREFIX + cls.ref)
        cls.source = cls.root / 'verified'
        with git_objects_only():
            cls.report = r.context('prepare', REPO, cls.source, **cls.inputs)
        cls.definition = yaml.load((REPO / r.DEFINITION).read_text(), Loader=yaml.BaseLoader)

    def copied(self):
        path = Path(tempfile.mkdtemp(dir=self.root)) / 'source'
        shutil.copytree(self.source, path)
        return path

    def verify(self, source, repo=REPO, **changes):
        with git_objects_only():
            return r.context('verify', repo, source, **{**self.inputs, **changes})

    def temporary_repo(self):
        path = Path(tempfile.mkdtemp(dir=self.root)) / 'repo'
        subprocess.run(['git', 'clone', '--shared', '--no-checkout', str(REPO), str(path)], check=True, capture_output=True)
        subprocess.run(['git', '-C', str(path), 'checkout', '--detach', self.ref], check=True, capture_output=True)
        return path

    def test_accepted_manifest_and_context_match_without_any_non_git_command(self):
        self.assertEqual(self.verify(self.source), self.report)
        self.assertEqual(self.report['backendTree'], r.BACKEND)
        self.assertEqual(self.report['sourceManifestSha256'], r.MANIFEST)
        self.assertEqual(self.report['sourceHarnessCommit'], r.HARNESS)
        self.assertEqual(self.report['buildDefinitionCommit'], self.ref)
        self.assertEqual(self.report['dockerContext'], str(self.source / 'backend'))
        self.assertEqual(json.loads((self.source / 'source-manifest.json').read_bytes())['format'], 3)

    def test_missing_branch_short_or_unavailable_build_reference_is_rejected(self):
        for ref in ['', 'HEAD', 'feature/staging-preview', 'a' * 39, 'B' * 40, '0' * 40]:
            with self.subTest(ref=ref), self.assertRaises(RuntimeError):
                self.verify(self.source, build_ref=ref, image=r.IMAGE_PREFIX + ref)

    def test_each_wrong_accepted_evidence_value_is_rejected_before_output(self):
        for key, value in [('harness_ref', '0' * 40), ('manifest_sha256', '0' * 64),
                           ('backend_tree', '0' * 40), ('lock_sha256', '0' * 64)]:
            target = self.root / ('must-not-create-' + key)
            with self.subTest(field=key), git_objects_only(), self.assertRaises(RuntimeError):
                r.context('prepare', REPO, target, **{**self.inputs, key: value})
            self.assertFalse(target.exists())

    def test_production_old_mutable_or_injected_image_names_are_rejected(self):
        for image in ['', 'backend:latest', r.IMAGE_PREFIX.replace('staging', 'production') + self.ref,
                      r.IMAGE_PREFIX + 'HEAD', r.IMAGE_PREFIX + self.ref + ';echo unsafe']:
            with self.subTest(image=image), self.assertRaises(RuntimeError):
                self.verify(self.source, image=image)

    def test_manifest_edits_and_self_rehashed_manifest_are_rejected(self):
        path = self.copied()
        manifest = path / 'source-manifest.json'
        data = json.loads(manifest.read_text())
        data['backendTree'] = '0' * 40
        manifest.write_text(json.dumps(data))
        with self.assertRaisesRegex(RuntimeError, 'manifest mismatch'):
            self.verify(path)
        import hashlib
        with self.assertRaisesRegex(RuntimeError, 'accepted composed-source evidence'):
            self.verify(path, manifest_sha256=hashlib.sha256(manifest.read_bytes()).hexdigest())

    def test_dependency_lock_and_backend_source_drift_are_rejected(self):
        for name in ['backend/package-lock.json', 'backend/src/app.ts']:
            path = self.copied()
            target = path / name
            target.write_bytes(target.read_bytes() + b'\nchanged\n')
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
                self.verify(path)

    def test_raw_current_backend_or_unapproved_admin_source_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'manifest mismatch'):
            self.verify(REPO)
        path = self.copied()
        relative = 'backend/src/modules/admin/admin.routes.ts'
        (path / relative).write_bytes((REPO / relative).read_bytes())
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            self.verify(path)

    def test_added_generated_file_or_executable_mode_cannot_enter_build_context(self):
        path = self.copied()
        added = path / 'backend/node_modules/injected'
        added.parent.mkdir()
        added.write_text('not approved source')
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            self.verify(path)
        added.unlink()
        (path / 'backend/src/app.ts').chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            self.verify(path)

    def test_symlinked_context_or_manifest_is_rejected(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.source, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'root symlink'):
            self.verify(alias)
        path = self.copied()
        manifest = path / 'source-manifest.json'
        manifest.unlink()
        manifest.symlink_to(self.source / 'source-manifest.json')
        with self.assertRaisesRegex(RuntimeError, 'manifest mismatch'):
            self.verify(path)

    def test_modified_composer_is_rejected_before_import_or_execution(self):
        repo = self.temporary_repo()
        marker = self.root / 'unapproved-code-ran'
        (repo / r.COMPOSER).write_text(f'from pathlib import Path\nPath({str(marker)!r}).touch()\n')
        with self.assertRaisesRegex(RuntimeError, 'composer content mismatch'):
            self.verify(self.source, repo=repo)
        self.assertFalse(marker.exists())

    def test_working_build_definition_or_guard_drift_is_rejected(self):
        repo = self.temporary_repo()
        for name in (r.SELF, r.DEFINITION):
            path = repo / name
            original = path.read_bytes()
            path.write_bytes(original + b'\n# unapproved\n')
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, 'working content/mode mismatch'):
                self.verify(self.source, repo=repo)
            path.write_bytes(original)
        (repo / r.DEFINITION).chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, 'working content/mode mismatch'):
            self.verify(self.source, repo=repo)

    def test_existing_output_is_not_overwritten(self):
        with git_objects_only(), self.assertRaisesRegex(RuntimeError, 'already exists'):
            r.context('prepare', REPO, self.source, **self.inputs)

    def test_build_definition_has_only_guarded_composed_context_and_ordered_steps(self):
        steps = self.definition['steps']
        self.assertEqual([s['id'] for s in steps], ['reviewed-build-definition', 'verified-composed-source', 'build-verified-context'])
        self.assertEqual(steps[1]['waitFor'], [steps[0]['id']])
        self.assertEqual(steps[2]['waitFor'], [steps[1]['id']])
        self.assertEqual(steps[1]['name'], 'python:3.12-bookworm')
        self.assertEqual(steps[1]['entrypoint'], 'python3')
        self.assertEqual(steps[1]['args'], [
            '/workspace/repo/' + r.SELF, 'prepare', '--repo=/workspace/repo', '--source=/workspace/g1-composed',
            '--build-ref=${_GIT_SHA}', '--harness-ref=${_SOURCE_HARNESS_SHA}',
            '--manifest-sha256=${_SOURCE_MANIFEST_SHA256}', '--backend-tree=${_BACKEND_TREE}',
            '--lock-sha256=${_LOCK_SHA256}', '--image=${_IMAGE}',
        ])
        self.assertEqual(steps[2]['name'], 'gcr.io/cloud-builders/docker')
        self.assertEqual(steps[2]['args'], [
            'build', '--file=/workspace/g1-composed/backend/Dockerfile', '--tag=${_IMAGE}',
            '--label=io.diewish.source-kind=composed', '--label=io.diewish.build-definition-sha=${_GIT_SHA}',
            '--label=io.diewish.source-harness-sha=${_SOURCE_HARNESS_SHA}',
            '--label=io.diewish.source-manifest-sha256=${_SOURCE_MANIFEST_SHA256}',
            '--label=io.diewish.backend-tree=${_BACKEND_TREE}', '--label=io.diewish.lock-sha256=${_LOCK_SHA256}',
            '/workspace/g1-composed/backend',
        ])
        self.assertEqual(self.definition['images'], ['${_IMAGE}'])
        self.assertEqual(self.definition['options'], {'logging': 'CLOUD_LOGGING_ONLY'})
        self.assertEqual(set(self.definition), {'steps', 'images', 'options'})
        for step in steps:
            self.assertNotIn('allowFailure', step)
            self.assertNotIn('allowExitCodes', step)
            self.assertNotIn('secretEnv', step)
        text = json.dumps(self.definition)
        for forbidden in ['/workspace/repo/backend', 'gcloud', 'migrate', 'ALLOW_LOOSE', 'DIEWISH_APPLICATION_SHA']:
            self.assertNotIn(forbidden, text)

    def test_checkout_uses_full_objects_and_rejects_injection_before_any_git_call(self):
        step = self.definition['steps'][0]
        self.assertEqual(step['env'], ['G1_BUILD_REF=${_GIT_SHA}'])
        script = step['args'][1].replace('$$', '$')
        self.assertIn('git fetch --no-tags origin "${G1_BUILD_REF}"', script)
        self.assertNotIn('--depth', script)
        fake_bin = self.root / 'fake-bin'
        fake_bin.mkdir()
        marker = self.root / 'git-was-invoked'
        fake_git = fake_bin / 'git'
        fake_git.write_text('#!/bin/sh\nprintf called >> "$MARKER"\nexit 99\n')
        fake_git.chmod(0o755)
        for value in ['', 'HEAD', 'a' * 39, 'a' * 41, 'B' * 40, '";git unsafe', '$(git unsafe)']:
            result = REAL_RUN(['/bin/sh', '-c', script], env={'PATH': str(fake_bin), 'G1_BUILD_REF': value, 'MARKER': str(marker)}, capture_output=True)
            with self.subTest(value=value):
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(marker.exists())

    def test_new_check_is_pr_only_read_only_and_does_not_run_previous_suites(self):
        workflow = yaml.load((REPO / '.github/workflows/test2-security-build-contract-checks.yml').read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(set(workflow['on']), {'pull_request'})
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertEqual(set(workflow['jobs']), {'offline-contract'})
        job = workflow['jobs']['offline-contract']
        self.assertNotIn('services', job)
        commands = [s['run'] for s in job['steps'] if 'run' in s]
        self.assertEqual(commands, ['python3 -m pip install --disable-pip-version-check PyYAML==6.0.3',
                                    'python3 scripts/test2-security-build-context.test.py'])
        paths = workflow['on']['pull_request']['paths']
        previous = yaml.load((REPO / '.github/workflows/test2-security-source-checks.yml').read_text(), Loader=yaml.BaseLoader)
        self.assertFalse(set(paths) & set(previous['on']['pull_request']['paths']))
        self.assertIn(r.DEFINITION, paths)



class JourneyBuildInputContracts(unittest.TestCase):
    def setUp(self):
        import hashlib
        self.temp=tempfile.TemporaryDirectory(prefix='g1-journey-source-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name); self.repo=self.root/'repo'; self.repo.mkdir()
        def git(*args):
            return subprocess.check_output(['git','-C',str(self.repo),*args],stderr=subprocess.PIPE).decode().strip()
        self.git=git
        git('init','-q'); git('config','user.name','Offline fixture'); git('config','user.email','fixture@example.invalid')
        (self.repo/'backend').mkdir()
        (self.repo/'backend/package-lock.json').write_text('{"fixture":true}\n')
        (self.repo/'backend/app.js').write_text('approved fixture\n')
        git('add','.'); git('commit','-qm','Approved application')
        baseline=git('rev-parse','HEAD'); tree=git('rev-parse','HEAD:backend')
        files={}
        for item in subprocess.check_output(['git','-C',str(self.repo),'ls-tree','-r','-z','HEAD','backend']).split(b'\0'):
            if item:
                metadata,name=item.split(b'\t'); mode,kind,oid=metadata.decode().split()
                files[name.decode()]={'blob':oid,'mode':mode}
        lock=hashlib.sha256((self.repo/'backend/package-lock.json').read_bytes()).hexdigest()
        manifest={'format':4,'applicationCommit':baseline,'backendTree':tree,'lockSha256':lock,'files':files}
        checksum=hashlib.sha256((json.dumps(manifest,sort_keys=True,indent=2)+'\n').encode()).hexdigest()
        for name in (r.SELF,r.DEFINITION):
            target=self.repo/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes((REPO/name).read_bytes())
        git('add','.'); git('commit','-qm','Release preparation')
        self.ref=git('rev-parse','HEAD')
        self.source=self.root/'source'
        patcher=patch.multiple(r,G1_SOURCE=baseline,G1_BACKEND=tree,G1_LOCK=lock,G1_MANIFEST=checksum)
        patcher.start(); self.addCleanup(patcher.stop)
        self.args=dict(build_ref=self.ref,harness_ref=baseline,manifest_sha256=checksum,backend_tree=tree,
                       lock_sha256=lock,image=r.IMAGE_PREFIX+self.ref)

    def prepare(self,**changes):
        return r.context('prepare',self.repo,self.source,**{**self.args,**changes})

    def verify(self,**changes):
        return r.context('verify',self.repo,self.source,**{**self.args,**changes})

    def test_exact_reviewed_tree_is_built_and_verified_without_install_or_cloud(self):
        result=self.prepare()
        self.assertEqual(result,self.verify())
        self.assertEqual(result['backendTree'],r.G1_BACKEND)
        self.assertEqual(json.loads((self.source/'source-manifest.json').read_text())['format'],4)
        self.assertEqual((self.source/'backend/app.js').read_text(),'approved fixture\n')
        r.inputs(self.ref,r.HARNESS,r.MANIFEST,r.BACKEND,r.LOCK,r.IMAGE_PREFIX+self.ref)

    def test_missing_wrong_or_mixed_historical_source_inputs_are_rejected(self):
        for key,value in [('harness_ref',r.HARNESS),('manifest_sha256','0'*64),('backend_tree','0'*40),('lock_sha256','0'*64),('build_ref','HEAD'),('image','backend:latest')]:
            with self.subTest(key=key),self.assertRaises(RuntimeError): self.prepare(**{key:value})
            self.assertFalse(self.source.exists())

    def test_source_dependency_and_manifest_edits_are_rejected(self):
        self.prepare()
        for relative in ['backend/app.js','backend/package-lock.json','source-manifest.json']:
            path=self.source/relative; original=path.read_bytes(); path.write_bytes(original+b'edited')
            with self.subTest(relative=relative),self.assertRaises(RuntimeError): self.verify()
            path.write_bytes(original)

    def test_injected_files_executable_modes_and_symlink_are_rejected(self):
        self.prepare()
        path=self.source/'backend/extra'; path.write_text('unapproved')
        with self.assertRaises(RuntimeError): self.verify()
        path.unlink()
        path=self.source/'backend/app.js'; path.chmod(0o755)
        with self.assertRaises(RuntimeError): self.verify()
        path.unlink(); path.symlink_to(self.repo/'backend/app.js')
        with self.assertRaises(RuntimeError): self.verify()

    def test_wrong_checkout_dirty_guard_and_backend_tree_are_rejected(self):
        with self.assertRaises(RuntimeError): self.prepare(build_ref='0'*40,image=r.IMAGE_PREFIX+'0'*40)
        path=self.repo/r.SELF; original=path.read_bytes(); path.write_bytes(original+b'\n# unreviewed\n')
        with self.assertRaises(RuntimeError): self.prepare()
        path.write_bytes(original)
        (self.repo/'backend/app.js').write_text('foreign app')
        self.git('add','.'); self.git('commit','-qm','Foreign backend')
        ref=self.git('rev-parse','HEAD')
        with self.assertRaises(RuntimeError): self.prepare(build_ref=ref,image=r.IMAGE_PREFIX+ref)

    def test_existing_output_and_nested_destination_cannot_be_overwritten(self):
        self.prepare()
        with self.assertRaises(RuntimeError): self.prepare()
        with self.assertRaises(RuntimeError):
            r.context('prepare',self.repo,self.repo/'inside',**self.args)


if __name__ == '__main__':
    unittest.main()
