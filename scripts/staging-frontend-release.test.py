"""Offline failure-path tests: no credentials, network, Docker or cloud calls."""
import copy
import json
import os
import subprocess
from contextlib import contextmanager, redirect_stdout
from io import StringIO
import importlib.util
import io
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import zipfile
import yaml

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('staging-frontend-release.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


@contextmanager
def release_context(saved):
    # Runtime/build/rollback tests start after entrypoint verification. The real
    # admission and artifact rejection paths are exercised separately below.
    request = {'mode': 'release', 'inspect_run_id': '123', 'inspected_source': 'a'*40}
    prior = {key: saved.get(key) for key in r.SNAPSHOT_FIELDS}
    with patch.object(r, 'activation', return_value=request), patch.object(r, 'inspection', return_value=prior):
        yield


def revision(name, values=None, secrets=None):
    env = [{'name': k, 'value': v} for k, v in (values or {}).items()]
    env += [{'name': k, 'valueFrom': {'secretKeyRef': v}} for k, v in (secrets or {}).items()]
    return {'metadata': {'name': name}, 'spec': {'containers': [{'image': 'image@sha256:test', 'env': env}]},
            'status': {'imageDigest': 'image@sha256:test'}}


def service(rows):
    return {'status': {'traffic': rows}, 'spec': {'containers': []}}


class Guards(unittest.TestCase):
    def test_candidate_tag_stays_within_cloud_run_combined_limit(self):
        self.assertEqual(len(r.FRONT) + len('next-security-candidate'),47)
        self.assertEqual(r.candidate_tag(),'next-sec')
        self.assertLessEqual(len(r.FRONT) + len(r.candidate_tag()),46)
        with patch.object(r,'CANDIDATE_TAG','next-security-candidate'):
            with self.assertRaisesRegex(RuntimeError,'exceeds Cloud Run limit'):
                r.candidate_tag()

    def test_diagnostics_redact_credentials_urls_and_connection_strings(self):
        payload = """ERROR INVALID_ARGUMENT: CPU must be below memory limit
ERROR https://alice:secret@host.invalid/path?token=private
ERROR Authorization: Bearer sensitive-token
ERROR DATABASE_URL=postgresql://alice:private@db.invalid/db
ERROR api_key=super-private
ERROR ya29.private-access-token
ERROR eyJheader.eyJpayload.signature
ERROR serviceAccount=person@example.com
"""
        safe = str(r.safe_error(payload))
        for secret in ['alice','private','sensitive-token','super-private','example.com','eyJheader']:
            self.assertNotIn(secret, safe)
        self.assertIn('CPU must be below memory limit', safe)

    def test_cloud_failure_retains_exit_classification_and_safe_message(self):
        import tempfile, os, json
        result = r.subprocess.CompletedProcess([], 1, '', 'ERROR (gcloud.run.deploy) INVALID_ARGUMENT: CPU must be 1; request id: 12345678-abcd-abcd-abcd-123456789abc')
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'RUNNER_TEMP':temp}), patch.object(r.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, 'exit=1; INVALID_ARGUMENT'):
                r.cloud('run','deploy',r.FRONT,'--no-traffic')
            record=json.loads((Path(temp)/'frontend-release-evidence/gcloud-failure.json').read_text())
            self.assertEqual(record['exitCode'],1)
            self.assertEqual(record['classification'],'INVALID_ARGUMENT')
            self.assertEqual(record['requestOrOperationIds'],['12345678-abcd-abcd-abcd-123456789abc'])

    def test_successful_cloud_read_does_not_print_service_json(self):
        result = r.subprocess.CompletedProcess([],0,'{"privateEnvironment":"not-for-logs"}','')
        with patch.object(r.subprocess,'run',return_value=result), patch('builtins.print') as out:
            self.assertEqual(r.cloud('run','services','describe',r.FRONT), {'privateEnvironment':'not-for-logs'})
            out.assert_not_called()

    def test_ambiguous_traffic_rejected(self):
        for values in [[], [{'revisionName': 'a', 'percent': 50}, {'revisionName': 'b', 'percent': 50}]]:
            with self.assertRaises(RuntimeError):
                r.serving(service(values))

    def test_backend_split_and_secret_boundaries(self):
        back = service([{'revisionName': r.ADMIN_REV, 'percent': 100, 'tag': 'admin-legacy', 'url': r.ADMIN},
                        {'revisionName': r.USER_REV, 'tag': 'diewish-test2', 'url': r.USER}])
        a = revision(r.ADMIN_REV, secrets={'DATABASE_URL': {'name': 'diewish-staging-database-url', 'key': 'latest'}})
        flags = {k: 'false' for k in ['COACH_SYNC_ENABLED','STAGING_AUTOMATION_ENABLED','SCHEDULER_TRIGGER_ENABLED','NUTRITION_JOBS_ENABLED']}
        u = revision(r.USER_REV, flags, {'DATABASE_URL': {'name': 'diewish-staging-test2-database-url', 'key': '1'}})
        r.check_backend(back, a, u)
        bad = copy.deepcopy(u)
        bad['spec']['containers'][0]['env'][-1]['valueFrom']['secretKeyRef']['name'] = 'diewish-staging-database-url'
        with self.assertRaises(RuntimeError):
            r.check_backend(back, a, bad)
        back['status']['traffic'][1]['percent'] = 100
        with self.assertRaises(RuntimeError):
            r.check_backend(back, a, u)

    def test_router_rejects_foreign_origin_or_disabled_flag(self):
        r.check_router(revision('front', r.ROUTER))
        for key in r.ROUTER:
            with self.assertRaises(RuntimeError):
                r.check_router(revision('front', {**r.ROUTER, key: 'https://foreign.invalid'}))

    def test_cloud_rejects_backend_and_database_mutations(self):
        with patch.object(r.subprocess, 'run') as run:
            for args in [('run','deploy',r.BACK,'--no-traffic'),
                         ('run','deploy',r.FRONT),
                         ('run','services','update-traffic',r.BACK),
                         ('secrets','versions','access','latest'),
                         ('scheduler','jobs','resume','job')]:
                with self.assertRaises(RuntimeError):
                    r.cloud(*args)
            run.assert_not_called()

    def test_failed_gate_never_builds_or_deploys(self):
        with release_context({'source':'a'*40}), patch.dict(os.environ, {'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r, 'source', return_value='a' * 40), patch.object(r, 'gates', side_effect=RuntimeError('gate failed')), patch.object(r, 'cloud') as cloud, patch.object(r, 'build') as build:
            with self.assertRaises(RuntimeError):
                r.release({'source':'a' * 40})
            cloud.assert_not_called()
            build.assert_not_called()

    def run_release(self, problem=None):
        saved = {'source': 'a' * 40, 'old_frontend': {'revision': 'real-serving-old'},
                 'newImage': 'image@sha256:test', 'beforeHealth': {'baseline': True}}
        old = revision('real-serving-old', r.ROUTER)
        new = revision('new', {**r.ROUTER, 'DIEWISH_APPLICATION_SHA': saved['source']})
        if problem == 'digest': new['status']['imageDigest']='foreign@sha256:test'
        if problem == 'environment': new['spec']['containers'][0]['env'].append({'name':'FOREIGN','value':'true'})
        if problem == 'spec': new['spec']['containers'][0]['resources']={'limits':{'cpu':'2'}}
        candidate = service([{'revisionName':'real-serving-old','percent':100},
                             {'revisionName':'new','tag':r.CANDIDATE_TAG,'url':'https://candidate.invalid'}])
        restored = service([{'revisionName':'real-serving-old','percent':100}])
        if problem == 'candidate_traffic':
            candidate['status']['traffic'][1]['percent'] = 1
        if problem == 'foreign':
            restored['status']['traffic'] = [{'revisionName':'foreign-release','percent':100}]
        if problem == 'split':
            restored['status']['traffic'] = [{'revisionName':'new','percent':50},{'revisionName':'real-serving-old','percent':50}]
        calls = []
        def cloud(*args):
            calls.append(args)
            if args[:3] == ('run','services','update-traffic') and args[-1] == 'real-serving-old=100':
                restored['status']['traffic'] = [{'revisionName':'real-serving-old','percent':100}]
            if problem == 'uncertain_swap' and args[:3] == ('run','services','update-traffic') and args[-1] == 'new=100':
                raise RuntimeError('uncertain response')
        def rev(name):
            return old if name == 'real-serving-old' else new
        def smoke():
            if problem in ['browser', 'foreign', 'split']:
                raise RuntimeError('login failed')
        with release_context(saved), patch.dict(os.environ, {'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r, 'source', return_value=saved['source']), patch.object(r, 'gates'), patch.object(r, 'build'), patch.object(r, 'image_version'), patch.object(r, 'save'), patch.object(r, 'unchanged', return_value=candidate), patch.object(r, 'cloud', side_effect=cloud), patch.object(r, 'revision', side_effect=rev), patch.object(r, 'get', return_value=(200 if problem == 'wrong_host' else 421,b'')), patch.object(r, 'live', return_value={'baseline':True}), patch.object(r, 'surfaces'), patch.object(r, 'browser_smoke', side_effect=smoke), patch.object(r, 'service', return_value=restored):
            if problem:
                with self.assertRaises(RuntimeError):
                    r.release(saved)
            else:
                r.release(saved)
        return saved, calls

    def test_browser_failure_restores_real_serving_revision_and_checks_health(self):
        saved, calls = self.run_release('browser')
        self.assertEqual(saved['rollback'], 'RESTORED_AND_HEALTH_VERIFIED')
        self.assertEqual(calls[-1][-1], 'real-serving-old=100')
        self.assertIn('rollbackHealth', saved)
        self.assertTrue(all(r.BACK not in call for call in calls))

    def test_uncertain_swap_also_rolls_back(self):
        saved, calls = self.run_release('uncertain_swap')
        self.assertEqual(calls[-1][-1], 'real-serving-old=100')
        self.assertEqual(saved['decision'], 'NO_GO')

    def test_success_only_switches_frontend(self):
        saved, calls = self.run_release()
        self.assertEqual(saved['decision'], 'GO')
        self.assertEqual([c[-1] for c in calls if c[:3] == ('run','services','update-traffic')], ['new=100'])


    def test_zero_traffic_and_wrong_host_fail_before_cutover(self):
        for failure in ['candidate_traffic', 'wrong_host', 'digest', 'environment', 'spec']:
            saved, calls = self.run_release(failure)
            self.assertFalse(any(c[:3] == ('run','services','update-traffic') for c in calls))

    def test_foreign_frontend_is_never_overwritten(self):
        saved, calls = self.run_release('foreign')
        self.assertEqual(saved['decision'], 'NO_GO')
        self.assertEqual(len([c for c in calls if c[:3] == ('run','services','update-traffic')]), 1)

    def test_own_ambiguous_split_rolls_back(self):
        saved, calls = self.run_release('split')
        self.assertEqual(saved['rollback'], 'RESTORED_AND_HEALTH_VERIFIED')
        self.assertEqual(calls[-1][-1], 'real-serving-old=100')

    def test_push_cannot_release_even_with_old_commit_trigger(self):
        # Keep this negative test independent of the current runner's real push
        # event, which may intentionally be an owner-authorized inspect marker.
        with tempfile.TemporaryDirectory() as temp:
            event_path = Path(temp) / 'unrelated-push.json'
            event_path.write_text(json.dumps({'head_commit': {'message': 'unrelated source update'}}))
            with patch.dict(os.environ, {'GITHUB_EVENT_NAME':'push','GITHUB_EVENT_PATH':str(event_path),'RELEASE_MODE':'release'}), patch.object(r,'cloud') as cloud:
                with self.assertRaisesRegex(RuntimeError,'explicit workflow_dispatch or verified marker'):
                    r.release({})
                cloud.assert_not_called()

    def test_diagnosis_has_no_build_or_deploy_path(self):
        with patch.object(r,'cloud',return_value=[] ) as cloud, patch.object(r,'save'), patch.object(r,'build') as build:
            saved={}
            r.diagnose(saved)
            build.assert_not_called()
            self.assertFalse(any(c.args[:2] == ('run','deploy') for c in cloud.call_args_list))
            self.assertEqual(saved['decision'],'READ_ONLY_DIAGNOSIS_COMPLETE')

    def test_workflow_ordinary_push_and_pr_cannot_obtain_cloud_identity(self):
        workflow = yaml.load(Path(r.WORKFLOW).read_text(), Loader=yaml.BaseLoader)
        self.assertIn('pull_request', workflow['on'])
        self.assertIn(r.MARKER, workflow['on']['push']['paths'])
        self.assertEqual(workflow['on']['push']['branches'], ['feature/staging-preview'])
        offline, cutover = workflow['jobs']['offline-guards'], workflow['jobs']['cutover']
        self.assertNotIn('id-token', workflow['permissions'])
        self.assertNotIn('permissions', offline)
        self.assertNotIn('google-github-actions', str(offline))
        self.assertEqual(offline['outputs']['mode'], '${{ steps.activation.outputs.mode }}')
        self.assertEqual(cutover['needs'], 'offline-guards')
        for guard in ["github.event_name == 'workflow_dispatch'", "github.event_name == 'push'",
                      "github.repository == '"+r.REPO+"'", "github.ref == 'refs/heads/feature/staging-preview'",
                      "github.actor == '"+r.OWNER+"'", "github.triggering_actor == '"+r.OWNER+"'",
                      "github.actor_id == '301813832'", "needs.offline-guards.outputs.mode == 'inspect'",
                      "needs.offline-guards.outputs.mode == 'release'"]:
            self.assertIn(guard, cutover['if'])
        self.assertEqual(cutover['environment'], 'staging')
        self.assertEqual(cutover['permissions'], {'contents':'read','actions':'read','id-token':'write'})
        self.assertEqual(workflow['concurrency'], {'group':'diewish-staging-preview','cancel-in-progress':'false'})
        steps=cutover['steps']
        auth=next(i for i,s in enumerate(steps) if s.get('uses','').startswith('google-github-actions/auth@'))
        self.assertTrue(any(s.get('run') == 'python3 scripts/staging-frontend-release.py authorize' for s in steps[:auth]))
        self.assertEqual(cutover['env']['RELEASE_MODE'], '${{ needs.offline-guards.outputs.mode }}')
        self.assertEqual(workflow['on']['workflow_dispatch']['inputs']['mode']['options'], ['inspect','release'])
        self.assertIn('inspect_run_id', workflow['on']['workflow_dispatch']['inputs'])
        self.assertNotIn('staging-notification-test-apk.yml',r.PREP_FILES)
        builder=Path('.github/cloudbuild/frontend-staging.yaml').read_text()
        self.assertIn('--label=DIEWISH_APPLICATION_SHA=${_GIT_SHA}',builder)
        self.assertIn('test "$(git rev-parse HEAD)" = "${_GIT_SHA}"',builder)

    def test_paused_scheduler_is_required_without_mutation(self):
        with patch.object(r,'cloud',return_value={'state':'PAUSED'}) as cloud:
            r.scheduler()
            self.assertEqual(cloud.call_args.args[:3],('scheduler','jobs','describe'))
        with patch.object(r,'cloud',return_value={'state':'ENABLED'}):
            with self.assertRaisesRegex(RuntimeError,'not paused'): r.scheduler()

    def test_backend_spec_or_traffic_drift_blocks_frontend_progress(self):
        back=service([{'revisionName':r.ADMIN_REV,'percent':100}])
        front=service([{'revisionName':'actual-old','percent':100}])
        saved={'backendTraffic':r.rows(back),'backendSpecFingerprint':r.fingerprint(back),
               'old_frontend':{'revision':'actual-old'}}
        with patch.object(r,'source'), patch.object(r,'service',side_effect=[back,front]), patch.object(r,'scheduler'):
            self.assertEqual(r.unchanged(saved),front)
        for key,value in [('backendTraffic',[]),('backendSpecFingerprint','different')]:
            with patch.object(r,'source'), patch.object(r,'service',side_effect=[back,front]), self.assertRaisesRegex(RuntimeError,'concurrent backend'):
                r.unchanged({**saved,key:value})
        front['status']['traffic'][0]['revisionName']='foreign'
        with patch.object(r,'source'), patch.object(r,'service',side_effect=[back,front]), self.assertRaisesRegex(RuntimeError,'concurrent frontend'):
            r.unchanged(saved)

    def test_runtime_source_marker_is_same_as_new_build_source(self):
        saved,calls=self.run_release()
        deploy=next(c for c in calls if c[:2] == ('run','deploy'))
        self.assertEqual(deploy[2],r.FRONT)
        self.assertIn('--no-traffic',deploy)
        self.assertIn('DIEWISH_APPLICATION_SHA='+saved['source'],deploy[-1])



class SourceGuards(unittest.TestCase):
    approved_test = 'frontend/e2e/admin-entitlement-operations.spec.js'
    approved_blob = '503fc08f916c089cf5a06408f88e69a23efb9fe0'

    def check(self, sha='a'*40, ref='refs/heads/feature/staging-preview', remote=None,
              changed='', ancestor=0, checkout=None, dirty='', entry=None,
              approved_ancestor=0, reviewed_entries=None, current_entries=None):
        def output(cmd, **kwargs):
            if cmd[1] == 'rev-parse': return checkout or sha
            if cmd[1] == 'status': return dirty
            if cmd[1] == 'diff': return changed
            if cmd[1] == 'ls-tree':
                path = cmd[-1]
                if path == self.approved_test:
                    self.assertEqual(cmd, ['git', 'ls-tree', '-z', '--full-tree', sha, '--', path])
                    return self.approved_entry() if entry is None else entry
                reviewed = cmd[4] == r.APPROVED_SOURCE
                entries = r.APPROVED_ENTRIES if reviewed else r.APPROVED_CURRENT_ENTRIES
                overrides = reviewed_entries if reviewed else current_entries
                self.assertIn(path, entries)
                return (overrides or {}).get(path, entries[path] + '\t' + path + '\0')
            raise AssertionError(cmd)
        def ancestry(cmd, **kwargs):
            return subprocess.CompletedProcess(cmd, ancestor if cmd[3] == r.MERGED else approved_ancestor)
        with patch.dict(os.environ, {'GITHUB_SHA':sha,'GITHUB_REF':ref,'GITHUB_REPOSITORY':r.REPO}), patch.object(r,'api',return_value={'object':{'sha':remote or sha}}), patch.object(r.subprocess,'check_output',side_effect=output), patch.object(r.subprocess,'run',side_effect=ancestry):
            return r.source()

    def approved_entry(self):
        return '100644 blob ' + self.approved_blob + '\t' + self.approved_test + '\0'

    def test_only_exact_reviewed_regular_admin_test_is_additionally_allowed(self):
        self.assertNotIn(self.approved_test, r.PREP_FILES)
        self.assertEqual(self.check(changed=self.approved_test), 'a'*40)
        self.assertEqual(self.check(changed='\n'.join([*sorted(r.PREP_FILES), self.approved_test])), 'a'*40)

    def test_admin_exception_rejects_other_blob_deletion_type_mode_path_or_extra_entry(self):
        approved = self.approved_entry()
        for entry in ['', approved.replace(self.approved_blob, 'b'*40),
                      approved.replace('100644', '120000'), approved.replace('100644', '100755'),
                      approved.replace('100644 blob', '040000 tree'),
                      approved.replace('100644 blob', '160000 commit'),
                      approved.replace(self.approved_test, 'frontend/e2e/other-admin.spec.js'),
                      approved.rstrip('\0'), approved + approved]:
            with self.subTest(entry=entry), self.assertRaisesRegex(RuntimeError, 'unapproved Admin test tree entry'):
                self.check(changed=self.approved_test, entry=entry)

    def test_approved_admin_blob_never_allows_another_test_or_product_drift(self):
        for path in ['frontend/e2e/admin-other.spec.js', 'frontend/src/app/admin/page.tsx',
                     'frontend/src/app/dashboard/page.tsx', 'backend/src/app.ts',
                     'backend/prisma/schema.prisma', '.github/workflows/foreign-hardening.yml', 'foreign.txt']:
            with self.subTest(path=path), self.assertRaisesRegex(RuntimeError, 'application drift'):
                self.check(changed=self.approved_test + '\n' + path)

    def test_admin_exception_does_not_bypass_existing_source_guards(self):
        for kwargs in [{'sha':'abc'}, {'ref':'refs/heads/main'}, {'remote':'b'*40},
                       {'ancestor':1}, {'checkout':'b'*40}, {'dirty':' M ' + self.approved_test}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(RuntimeError):
                self.check(changed=self.approved_test, **kwargs)

    def test_real_git_admin_entry_accepts_approved_bytes_and_rejects_mutation_deletion_or_symlink(self):
        content = Path(self.approved_test).read_bytes()
        for problem in [None, 'content', 'deleted', 'symlink', 'executable', 'extra']:
            with self.subTest(problem=problem), marker_checkout() as fixture:
                target = Path(self.approved_test)
                target.parent.mkdir(parents=True)
                # Like MERGED in production, the baseline already contains this file.
                target.write_bytes(b'Previously reviewed Admin test fixture\n')
                fixture['git']('add', '.')
                fixture['git']('commit', '-qm', 'Reviewed earlier Admin test')
                baseline = fixture['git']('rev-parse', 'HEAD')
                target.write_bytes(content)
                if problem == 'content': target.write_bytes(content + b'\n// unreviewed\n')
                if problem == 'symlink':
                    target.unlink()
                    target.symlink_to('unapproved-target')
                if problem == 'executable': target.chmod(0o755)
                if problem == 'extra': Path('frontend/e2e/admin-other.spec.js').write_text('unreviewed')
                fixture['git']('add', '.')
                fixture['git']('commit', '-qm', 'Synthetic Admin test change')
                if problem == 'deleted':
                    target.unlink()
                    fixture['git']('add', '.')
                    fixture['git']('commit', '-qm', 'Delete synthetic Admin test')
                sha = fixture['git']('rev-parse', 'HEAD')
                # Isolate the earlier Admin exception; PR #135 pins have their own real-Git tests below.
                with patch.multiple(r, MERGED=baseline, APPROVED_SOURCE=baseline, APPROVED_ENTRIES={}, APPROVED_CURRENT_ENTRIES={}), patch.dict(os.environ, {'GITHUB_SHA':sha}), patch.object(r, 'api', return_value={'object':{'sha':sha}}):
                    if problem:
                        with self.assertRaisesRegex(RuntimeError, 'unapproved Admin test tree entry|application drift'):
                            r.source()
                    else:
                        self.assertEqual(fixture['git']('hash-object', self.approved_test), self.approved_blob)
                        self.assertEqual(r.source(), sha)

    def test_reviewed_baseline_and_release_only_whitelist(self):
        self.assertEqual(r.MERGED,'51ba9fcef7cff7627792303584448c91b05d70dd')
        self.assertEqual(r.APPROVED_SOURCE,'0ab4fab4f1cec0ea611759fd92df154f27ccd12f')
        self.assertEqual(len(r.APPROVED_ENTRIES),14)
        self.assertEqual(set(r.APPROVED_CURRENT_ENTRIES),set(r.APPROVED_ENTRIES))
        self.assertEqual(self.check(changed='\n'.join(sorted(r.PREP_FILES))), 'a'*40)
        self.assertEqual(r.PREP_FILES, {r.WORKFLOW, '.github/cloudbuild/frontend-staging.yaml', 'scripts/staging-frontend-release.py', 'scripts/staging-frontend-release.test.py', 'scripts/journey-live-acceptance.cjs', 'scripts/journey-live-acceptance.test.cjs', 'scripts/test2-security-build-context.py', 'scripts/test2-security-build-context.test.py', r.MARKER})

    def test_app_auth_dependency_or_non_release_drift_rejected(self):
        for path in ['frontend/src/app/dashboard/page.tsx','frontend/package-lock.json',
                     'frontend/package.json','frontend/src/presentation/components/dashboard/daily-journey-section.tsx',
                     'backend/package.json','backend/package-lock.json',
                     'backend/vendor/minimatch-compat/package.json','backend/vendor/minimatch-compat/index.cjs',
                     'frontend/vendor/minimatch-compat/package.json','frontend/vendor/minimatch-compat/index.cjs',
                     'frontend/e2e/dashboard-edit-sanity.spec.ts','scripts/minimatch-security.test.cjs',
                     'backend/Dockerfile','frontend/Dockerfile',
                     'frontend/public/brands/diewish-wordmark-approved.png','android/app/build.gradle.kts',
                     'backend/prisma/schema.prisma','backend/prisma/migrations/new/migration.sql',
                     'backend/src/auth.ts','.github/workflows/staging-notification-test-apk.yml',
                     '.github/workflows/staging-test2-backend-notraffic.yml','.github/workflows/staging-preview.yml',
                     '.github/workflows/notification-alerts-native-ci.yml','secrets.env']:
            if path in r.APPROVED_ENTRIES:
                with self.subTest(path=path), self.assertRaisesRegex(RuntimeError,'unapproved G1 source tree entry'):
                    self.check(changed=path, current_entries={path:'100644 blob ' + 'b'*40 + '\t' + path + '\0'})
            else:
                with self.subTest(path=path), self.assertRaisesRegex(RuntimeError,'application drift'):
                    self.check(changed=path)

    def test_wrong_sha_ref_staging_advance_checkout_or_baseline_rejected(self):
        for kwargs in [{'sha':'abc'},{'sha':'A'*40},{'sha':'a'*40+';'},
                       {'ref':'refs/heads/main'},{'remote':'b'*40}, {'ancestor':1},
                       {'checkout':'b'*40},{'approved_ancestor':1},{'dirty':' M scripts/staging-frontend-release.py'},
                       {'dirty':'?? untracked.py'}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(RuntimeError): self.check(**kwargs)

    def test_every_reviewed_and_current_entry_rejects_missing_wrong_blob_mode_type_path_or_duplicate(self):
        for reviewed, entries in [(True,r.APPROVED_ENTRIES),(False,r.APPROVED_CURRENT_ENTRIES)]:
            for path, expected in entries.items():
                entry=expected+'\t'+path+'\0'
                for bad in ['',entry.replace(expected.split()[-1],'b'*40),entry.replace('100644','100755'),
                            entry.replace('100644','120000'),entry.replace('blob','tree'),
                            entry.replace(path,path+'.foreign'),entry.rstrip('\0'),entry+entry]:
                    with self.subTest(reviewed=reviewed,path=path,bad=bad), self.assertRaisesRegex(RuntimeError,'unapproved G1 source tree entry'):
                        self.check(**{'reviewed_entries' if reviewed else 'current_entries':{path:bad}})

    def test_real_git_reviewed_files_pass_and_each_content_mode_deletion_symlink_or_extra_path_fails(self):
        original=Path.cwd(); test_bytes=Path(__file__).read_bytes()
        with tempfile.TemporaryDirectory(prefix='g1-approved-files-') as temp:
            repo=Path(temp)/'repo'
            subprocess.run(['git','clone','--shared','--no-checkout',str(original),str(repo)],check=True,capture_output=True)
            def git(*args):
                return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.PIPE).decode().strip()
            git('checkout','--detach',r.APPROVED_SOURCE)
            git('config','user.name','Offline fixture');git('config','user.email','fixture@example.invalid')
            (repo/'scripts/staging-frontend-release.test.py').write_bytes(test_bytes)
            git('add','.');git('commit','--allow-empty','-qm','Separately reviewed release tests')
            accepted=git('rev-parse','HEAD')
            def check():
                sha=git('rev-parse','HEAD')
                with patch.dict(os.environ,{'GITHUB_REPOSITORY':r.REPO,'GITHUB_SHA':sha,'GITHUB_REF':'refs/heads/feature/staging-preview'}), patch.object(r,'api',return_value={'object':{'sha':sha}}):
                    return r.source()
            try:
                os.chdir(repo)
                self.assertEqual(check(),accepted)
                for path in r.APPROVED_CURRENT_ENTRIES:
                    target=repo/path
                    for problem in ['content','mode','deleted','symlink']:
                        if problem=='content':target.write_bytes(target.read_bytes()+b'\n')
                        elif problem=='mode':target.chmod(0o755)
                        elif problem=='deleted':target.unlink()
                        else:target.unlink();target.symlink_to('unreviewed-target')
                        git('add','.');git('commit','-qm','Synthetic unapproved entry')
                        with self.subTest(path=path,problem=problem), self.assertRaisesRegex(RuntimeError,'unapproved G1 source tree entry'):
                            check()
                        git('reset','--hard',accepted)  # Disposable fixture only.
                extra=repo/'backend/vendor/minimatch-compat/foreign.cjs';extra.write_text('unreviewed')
                git('add','.');git('commit','-qm','Synthetic extra file')
                with self.assertRaisesRegex(RuntimeError,'application drift'):check()
                git('reset','--hard',accepted)
                # Identical reviewed bytes copied onto an earlier lineage still cannot pass.
                git('checkout','--detach','5ce15fc4a9d99fadb1f60e9e59501992e8c43431')
                for path in r.APPROVED_ENTRIES:
                    target=repo/path;target.parent.mkdir(parents=True,exist_ok=True)
                    target.write_bytes(subprocess.check_output(['git','-C',str(original),'show',r.APPROVED_SOURCE+':'+path]))
                (repo/'scripts/staging-frontend-release.test.py').write_bytes(test_bytes)
                git('add','.');git('commit','-qm','Copied bytes without approved ancestry')
                with self.assertRaisesRegex(RuntimeError,'approved security source is not an ancestor'):check()
            finally:os.chdir(original)


class Gates(unittest.TestCase):
    sha='a'*40

    def run_gates(self, problem=None):
        requests=[]
        def api(path):
            requests.append(path)
            if '/jobs?' in path:
                jobs=[{'name':n,'status':'completed','conclusion':'success'} for n in r.HARDENING_JOBS]
                if problem == 'skipped_job': jobs[0]['conclusion']='skipped'
                if problem == 'duplicate_job': jobs[0]['name']=jobs[1]['name']
                return {'jobs':jobs}
            checked_sha=path.split('head_sha=')[1].split('&')[0]
            runs=[{'name':name,'path':workflow,'head_sha':checked_sha,'head_branch':'feature/staging-preview',
                   'event':'push','id':i,'created_at':'2026-10-23','run_attempt':1,
                   'status':'completed','conclusion':'success','html_url':'https://example.invalid/check'}
                  for i,(name,workflow) in enumerate(r.CHECKS.items())]
            if checked_sha == self.sha:
                if problem == 'missing': runs=[]
                elif problem == 'two_of_three': runs.pop()
                elif problem in ['failure','cancelled','skipped']: runs[0]['conclusion']=problem
                elif problem == 'wrong_sha': runs[0]['head_sha']='b'*40
                elif problem == 'wrong_workflow': runs[0]['path']='.github/workflows/fake.yml'
                elif problem == 'pr': runs[0]['event']='pull_request'
                elif problem == 'pending': runs[0]['status']='in_progress'
                elif problem == 'latest_failed': runs.append({**runs[0],'run_attempt':2,'conclusion':'failure'})
            return {'workflow_runs':runs}
        count=[0]
        def source():
            count[0]+=1
            if problem == 'advanced' and count[0]>1: raise RuntimeError('NO_GO: staging advanced')
            return self.sha
        with redirect_stdout(StringIO()), patch.object(r,'source',side_effect=source), patch.object(r,'api',side_effect=api), patch.object(r,'range',return_value=range(1),create=True), patch.object(r.time,'sleep'):
            r.gates()
        return requests

    def test_baseline_and_exact_release_head_require_all_three_checks(self):
        paths=self.run_gates()
        self.assertTrue(any('head_sha='+r.MERGED in p for p in paths))
        self.assertTrue(any('head_sha='+self.sha in p for p in paths))
        self.assertEqual(sum('/jobs?' in p for p in paths),2)

    def test_missing_failed_unverified_or_advancing_source_never_passes(self):
        for problem in ['missing','two_of_three','failure','cancelled','skipped','wrong_sha','wrong_workflow','pr',
                        'pending','latest_failed','skipped_job','duplicate_job','advanced']:
            with self.subTest(problem=problem), self.assertRaises(RuntimeError): self.run_gates(problem)


class BuildGuards(unittest.TestCase):
    sha='a'*40
    build_id='12345678-abcd-abcd-abcd-123456789abc'
    digest='sha256:'+'c'*64

    def run_build(self, problem=None):
        image=f'{r.REGION}-docker.pkg.dev/{r.PROJECT}/diewish-staging/frontend:journey-{self.sha}'
        result={'id':self.build_id,'projectId':r.PROJECT,'status':'SUCCESS',
                'substitutions':{'_GIT_SHA':self.sha,'_IMAGE':image,'_API_BASE_URL':'/api',
                                 '_SITE_URL':r.APP,'_API_PROXY_TARGET':'https://invalid-legacy-fallback.invalid'},
                'results':{'images':[{'name':image,'digest':self.digest}]}}
        if problem == 'source': result['substitutions']['_GIT_SHA']='b'*40
        if problem == 'identity': result['id']='87654321-abcd-abcd-abcd-123456789abc'
        if problem == 'project': result['projectId']='foreign-project'
        if problem == 'name': result['results']['images'][0]['name']='foreign-image'
        if problem == 'extra_image': result['results']['images']*=2
        if problem == 'retired': result['results']['images'][0]['digest']=r.RETIRED_DIGEST
        if problem == 'digest': result['results']['images'][0]['digest']='sha256:bad'
        if problem == 'failed': result['status']='FAILURE'
        if problem == 'pending': result['status']='WORKING'
        saved={'source':self.sha,'old_frontend':{'imageDigest':'image@'+(self.digest if problem == 'old_web' else r.RETIRED_DIGEST)}}
        source=[self.sha, 'b'*40] if problem == 'advanced' else [self.sha,self.sha]
        if problem == 'snapshot': saved['source']='b'*40
        def current_source():
            value=source.pop(0)
            if value != self.sha: raise RuntimeError('NO_GO: staging advanced')
            return value
        with patch.object(r,'source',side_effect=current_source), patch.object(r,'cloud',side_effect=[{'id':self.build_id},result]) as cloud, patch.object(r,'save'), patch.object(r,'range',return_value=range(1),create=True), patch.object(r.time,'sleep'):
            r.build(saved)
            self.assertEqual(cloud.call_args_list[0].args[:3],('builds','submit','--no-source'))
        return saved

    def test_new_build_uses_exact_source_and_records_immutable_digest(self):
        saved=self.run_build()
        self.assertTrue(saved['newImage'].endswith('@'+self.digest))
        self.assertEqual(saved['applicationSource'],self.sha)
        self.assertEqual(saved['buildId'],self.build_id)
        self.assertFalse(hasattr(r,'reuse_image'))

    def test_wrong_source_identity_name_digest_old_image_or_failure_rejected(self):
        for problem in ['source','identity','project','name','extra_image','retired','digest','failed','pending','advanced','snapshot','old_web']:
            with self.subTest(problem=problem), self.assertRaises(RuntimeError): self.run_build(problem)

    def image_check(self, problem=None):
        checksums={asset:r.hashlib.sha256((Path('frontend/public')/asset).read_bytes()).hexdigest() for asset in r.ASSETS}
        report={'next':'15.5.28','assets':checksums,'journey':True}
        marker=self.sha
        if problem == 'marker': marker='b'*40
        if problem == 'next': report['next']='15.5.0'
        if problem == 'checksum': report['assets']={}
        if problem == 'journey': report['journey']=False
        saved={'source':self.sha,'applicationSource':self.sha,'newImage':'image@'+self.digest}
        if problem == 'source': saved['applicationSource']='b'*40
        with patch.object(r.subprocess,'check_output',side_effect=['private-token',json.dumps({'DIEWISH_APPLICATION_SHA':marker}),json.dumps(report)]), patch.object(r.subprocess,'run') as run, patch.object(r,'save'):
            r.image_version(saved)
            self.assertTrue(all(call.kwargs.get('capture_output') for call in run.call_args_list))
        return saved

    def test_image_inspector_runs_in_node_against_container_layout(self):
        import tempfile
        js=next(value for value in r.image_version.__code__.co_consts if isinstance(value,str) and value.startswith('const fs='))
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for directory in ['public','node_modules/next','.next/server','.next/static']:
                (root/directory).mkdir(parents=True,exist_ok=True)
            (root/'node_modules/next/package.json').write_text('{"version":"15.5.28"}')
            (root/'public/approved.png').write_bytes(b'approved-image-bytes')
            bundle=root/'.next/static/dashboard.js'
            bundle.write_text('"data-journey-plan-meal data-journey-next data-journey-progress-area /tracking/meal-check-ins"')
            def inspect():
                return json.loads(subprocess.check_output(['node','-e',js,'["approved.png"]'],cwd=root,text=True))
            report=inspect()
            self.assertEqual(report,{'next':'15.5.28','journey':True,
                             'assets':{'approved.png':r.hashlib.sha256(b'approved-image-bytes').hexdigest()}})
            bundle.write_text('"old dashboard without Journey Pro"')
            (root/'public/approved.png').write_bytes(b'changed-image-bytes')
            changed=inspect()
            self.assertFalse(changed['journey'])
            self.assertNotEqual(changed['assets'],report['assets'])

    def test_image_content_verified_before_deploy(self):
        saved=self.image_check()
        self.assertEqual(saved['verifiedImageSource'],self.sha)
        self.assertTrue(saved['verifiedImageJourney'])

    def test_wrong_image_marker_next_asset_or_journey_rejected(self):
        for problem in ['marker','source','next','checksum','journey']:
            with self.subTest(problem=problem), self.assertRaises(RuntimeError): self.image_check(problem)


    def test_gate_recheck_failure_never_deploys_after_build(self):
        with release_context({'source':self.sha}), patch.dict(os.environ,{'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r,'source',return_value=self.sha), patch.object(r,'gates',side_effect=[None,RuntimeError('NO_GO: gate changed')]), patch.object(r,'unchanged'), patch.object(r,'build'), patch.object(r,'image_version'), patch.object(r,'cloud') as cloud:
            with self.assertRaisesRegex(RuntimeError,'gate changed'): r.release({'source':self.sha})
            cloud.assert_not_called()

    def test_build_or_image_failure_prevents_candidate_deploy(self):
        for function in ['build','image_version']:
            with release_context({'source':self.sha}), patch.dict(os.environ,{'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r,'source',return_value=self.sha), patch.object(r,'gates'), patch.object(r,'unchanged'), patch.object(r,'build'), patch.object(r,'image_version'), patch.object(r,function,side_effect=RuntimeError('NO_GO: mismatch')), patch.object(r,'cloud') as cloud:
                with self.assertRaises(RuntimeError): r.release({'source':self.sha})
                cloud.assert_not_called()


@contextmanager
def marker_checkout(mode='inspect', message=None, payload=None, extra=False, merge=False):
    """Real local git commits, synthetic GitHub event; never push or contact cloud."""
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        checkout = root/'repo'
        checkout.mkdir()
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=checkout, text=True, stderr=subprocess.PIPE).strip()
        git('init', '-q', '-b', 'feature/staging-preview')
        git('config', 'user.name', 'Offline fixture')
        git('config', 'user.email', 'fixture@example.invalid')
        marker = checkout/r.MARKER
        marker.parent.mkdir()
        marker.write_text('Inactive fixture\n')
        (checkout/'frontend').mkdir()
        (checkout/'frontend/package.json').write_text('{"dependencies":{"next":"15.5.28"}}')
        (checkout/'frontend/package-lock.json').write_text('{"packages":{"node_modules/next":{"version":"15.5.28"}}}')
        (checkout/'.github/staging-test2-split-active').write_text('active')
        git('add', '.')
        git('commit', '-qm', 'Reviewed preparation')
        before = git('rev-parse', 'HEAD')
        data = {'version':1, 'mode':mode, 'source_sha':before}
        if mode == 'release':
            data['inspect_run_id'] = 123
            data['target'] = 'journey'
        if payload is not None: data = payload(data)
        marker.write_text(data if isinstance(data,str) else json.dumps(data))
        if extra: (checkout/'foreign.txt').write_text('unexpected')
        git('add', '.')
        intent = message if message is not None else (r.JOURNEY_INTENTS if mode == 'release' else r.INTENTS)[mode]
        git('commit', '-qm', intent)
        sha = git('rev-parse', 'HEAD')
        if merge:
            tree = git('rev-parse', 'HEAD^{tree}')
            sha = git('commit-tree', tree, '-p', sha, '-p', before, '-m', intent)
            git('reset', '--hard', sha)
        event = {'repository':{'full_name':r.REPO}, 'sender':{'login':r.OWNER,'id':r.OWNER_ID},
                 'ref':'refs/heads/feature/staging-preview', 'before':before, 'after':sha,
                 'forced':False, 'deleted':False, 'created':False,
                 'commits':[{'id':sha}], 'head_commit':{'id':sha,'message':intent}}
        event_path = root/'event.json'
        def write_event(): event_path.write_text(json.dumps(event))
        write_event()
        environment = {'GITHUB_REPOSITORY':r.REPO, 'GITHUB_REF':event['ref'], 'GITHUB_SHA':sha,
                       'GITHUB_EVENT_NAME':'push', 'GITHUB_EVENT_PATH':str(event_path),
                       'GITHUB_ACTOR':r.OWNER, 'GITHUB_ACTOR_ID':str(r.OWNER_ID),
                       'GITHUB_TRIGGERING_ACTOR':r.OWNER, 'GITHUB_OUTPUT':str(root/'outputs'),
                       'RELEASE_MODE':''}
        old = Path.cwd()
        try:
            os.chdir(checkout)
            with patch.dict(os.environ,environment), patch.object(r,'api',return_value=[]) as api:
                yield {'git':git, 'sha':sha, 'before':before, 'marker':marker,
                       'event':event, 'write_event':write_event, 'output':root/'outputs','api':api}
        finally:
            os.chdir(old)


class Entrypoint(unittest.TestCase):
    def test_real_git_source_accepts_only_reviewed_prep_and_clean_checkout(self):
        # Keep the original baseline/clean-checkout fixture independent of PR #135's real-Git matrix.
        with marker_checkout() as f, patch.multiple(r,MERGED=f['before'],APPROVED_SOURCE=f['before'],APPROVED_ENTRIES={},APPROVED_CURRENT_ENTRIES={}), patch.object(r,'api',return_value={'object':{'sha':f['sha']}}):
            self.assertEqual(r.source(),f['sha'])
            Path('untracked.py').write_text('unreviewed')
            with self.assertRaisesRegex(RuntimeError,'dirty'): r.source()
            Path('untracked.py').unlink()
            Path('frontend/package.json').write_text('{"dependencies":{"next":"15.5.28"},"foreign":true}')
            f['git']('add','frontend/package.json'); f['git']('commit','-qm','Unreviewed product change')
            sha=f['git']('rev-parse','HEAD')
            with patch.dict(os.environ,{'GITHUB_SHA':sha}), patch.object(r,'api',return_value={'object':{'sha':sha}}):
                with self.assertRaisesRegex(RuntimeError,'application drift'): r.source()

    def test_source_rejects_foreign_repository_before_any_remote_or_git_read(self):
        with patch.dict(os.environ,{'GITHUB_REPOSITORY':'foreign/repo'}), patch.object(r,'api') as api, patch.object(r.subprocess,'check_output') as git:
            with self.assertRaisesRegex(RuntimeError,'wrong repository'): r.source()
            api.assert_not_called(); git.assert_not_called()

    def test_two_distinct_owner_marker_intents_use_real_single_parent_git_commits(self):
        for mode in ['inspect','release']:
            with self.subTest(mode=mode), marker_checkout(mode) as fixture:
                request = r.activation()
                self.assertEqual(request['mode'], mode)
                self.assertEqual(request['inspected_source'], fixture['before'])
                self.assertEqual(request['inspect_run_id'], '123' if mode == 'release' else '')
                fixture['api'].assert_called_once_with('/commits/'+fixture['sha']+'/pulls')

    def test_release_marker_is_a_separate_successor_of_the_inspected_commit(self):
        with marker_checkout() as f:
            inspected = f['sha']
            self.assertEqual(r.activation()['mode'],'inspect')
            f['marker'].write_text(json.dumps({'version':1,'mode':'release','source_sha':inspected,'inspect_run_id':123,'target':'journey'}))
            f['git']('add',r.MARKER); f['git']('commit','-qm',r.JOURNEY_INTENTS['release'])
            released=f['git']('rev-parse','HEAD')
            f['event'].update(before=inspected,after=released,commits=[{'id':released}],
                              head_commit={'id':released,'message':r.JOURNEY_INTENTS['release']})
            f['write_event']()
            with patch.dict(os.environ,{'GITHUB_SHA':released,'RELEASE_MODE':'release'}):
                request=r.activation()
                self.assertEqual(request,{'mode':'release','inspect_run_id':'123','inspected_source':inspected,'target':'journey'})
            self.assertNotEqual(inspected,released)

    def test_ordinary_push_pr_merge_and_multiple_commits_never_admit(self):
        for message in ['ordinary change', 'G1 frontend inspect\n\nextra',
                        'Merge pull request #999', 'G1 frontend release + G1 frontend inspect']:
            with marker_checkout(message=message), patch.object(r,'cloud') as cloud:
                self.assertIsNone(r.activation())
                r.main('authorize')
                for mode in ['inspect','release']:
                    with self.assertRaisesRegex(RuntimeError,'unverified'): r.main(mode)
                cloud.assert_not_called()
        with marker_checkout(merge=True), self.assertRaisesRegex(RuntimeError,'merge or multi-commit'):
            r.activation()
        with marker_checkout() as f:
            f['event']['commits'].append({'id':f['before']}); f['write_event']()
            with self.assertRaisesRegex(RuntimeError,'one explicit commit'): r.activation()
        with marker_checkout() as f:
            f['api'].return_value=[{'number':999}]
            with self.assertRaisesRegex(RuntimeError,'PR-associated'): r.activation()
        with marker_checkout(), patch.dict(os.environ,{'GITHUB_EVENT_NAME':'pull_request'}):
            self.assertIsNone(r.activation())

    def test_bad_marker_schema_multiple_fields_stale_source_and_mixed_files_rejected(self):
        mutations = [lambda d:{**d,'mode':'release'}, lambda d:{**d,'mode':'invalid'},
                     lambda d:{**d,'source_sha':'b'*40}, lambda d:{**d,'version':True},
                     lambda d:{**d,'extra':'value'}, lambda d:{k:v for k,v in d.items() if k!='mode'},
                     lambda d:json.dumps(d)[:-1]+',"mode":"inspect"}', lambda d:'not json']
        for change in mutations:
            with self.subTest(change=change), marker_checkout(payload=change), self.assertRaises((RuntimeError, ValueError)):
                r.activation()
        with marker_checkout(extra=True), self.assertRaisesRegex(RuntimeError,'only the existing marker'):
            r.activation()
        for value in [True, '123', 0, -1, '123;echo bad']:
            with self.subTest(value=value), marker_checkout('release',payload=lambda d:{**d,'inspect_run_id':value}), self.assertRaises(RuntimeError):
                r.activation()

    def test_wrong_actor_repository_ref_or_event_identity_never_gets_cloud(self):
        contexts = [{'GITHUB_REPOSITORY':'foreign/repo'}, {'GITHUB_REF':'refs/heads/main'},
                    {'GITHUB_REF':'refs/heads/other'}, {'GITHUB_ACTOR':'foreign'},
                    {'GITHUB_TRIGGERING_ACTOR':'foreign'}, {'GITHUB_ACTOR_ID':'1'}]
        for context in contexts:
            with self.subTest(context=context), marker_checkout(), patch.dict(os.environ,context), patch.object(r,'cloud') as cloud:
                with self.assertRaises(RuntimeError): r.main('inspect')
                cloud.assert_not_called()
        for change in [{'forced':True}, {'deleted':True}, {'created':True}, {'before':'b'*40},
                       {'after':'b'*40}, {'ref':'refs/heads/main'}, {'sender':{'login':'foreign','id':1}},
                       {'repository':{'full_name':'foreign/repo'}}]:
            with marker_checkout() as f:
                f['event'].update(change); f['write_event']()
                with self.assertRaises(RuntimeError): r.activation()

    def test_inspect_marker_cannot_authorize_release_or_emit_release_output(self):
        with marker_checkout(), patch.dict(os.environ,{'RELEASE_MODE':'release'}), patch.object(r,'cloud') as cloud:
            with self.assertRaisesRegex(RuntimeError,'mode differs'): r.release({})
            cloud.assert_not_called()
        with marker_checkout() as f, patch.object(r,'source',return_value=f['sha']), patch.object(r,'cloud') as cloud:
            r.main('authorize')
            self.assertEqual(f['output'].read_text(), 'mode=inspect\ntarget=frontend\n')
            cloud.assert_not_called()

    def test_inspect_is_only_snapshot_and_release_requires_proof_before_any_cloud(self):
        saved={'source':'a'*40,'old_frontend':{'revision':'old'}}
        with marker_checkout(), patch.object(r,'source'), patch.object(r,'snapshot',return_value=saved) as snapshot, patch.object(r,'save'), patch.object(r,'cloud') as cloud, patch.object(r,'release') as release:
            r.main('inspect')
            snapshot.assert_called_once()
            cloud.assert_not_called(); release.assert_not_called()
            self.assertEqual(saved['decision'],'PREFLIGHT_PASS')
            self.assertEqual(saved['mode'],'inspect')
            self.assertEqual(saved['applicationBaseline'],r.MERGED)
        with marker_checkout('release'), patch.object(r,'source'), patch.object(r,'inspection',side_effect=RuntimeError('missing proof')), patch.object(r,'snapshot') as snapshot, patch.object(r,'cloud') as cloud:
            for mode in ['authorize','release']:
                with self.assertRaisesRegex(RuntimeError,'missing proof'): r.main(mode)
            snapshot.assert_not_called(); cloud.assert_not_called()

    def test_dispatch_retained_with_owner_ref_explicit_mode_and_prior_inspect(self):
        for mode in ['inspect','release']:
            with marker_checkout() as f, patch.dict(os.environ,{'GITHUB_EVENT_NAME':'workflow_dispatch'}):
                f['event']['inputs']={'mode':mode,'inspect_run_id':'123' if mode=='release' else '', 'target':'journey'}
                f['write_event']()
                self.assertEqual(r.activation()['mode'],mode)
                if mode=='release':
                    f['event']['inputs']['inspect_run_id']=''; f['write_event']()
                    with self.assertRaisesRegex(RuntimeError,'prior inspect'): r.activation()

    def test_runtime_drift_from_prior_inspect_blocks_before_build(self):
        saved = {key: {'stable':True} for key in r.SNAPSHOT_FIELDS}
        for key in r.SNAPSHOT_FIELDS:
            with release_context(saved), patch.object(r,'inspection',return_value={**saved,key:{'drift':True}}), patch.dict(os.environ,{'RELEASE_MODE':'release'}), patch.object(r,'build') as build, patch.object(r,'cloud') as cloud:
                with self.assertRaisesRegex(RuntimeError,'runtime changed'): r.release(dict(saved))
                build.assert_not_called(); cloud.assert_not_called()


class InspectEvidence(unittest.TestCase):
    def evidence(self, change=None):
        request={'mode':'release','inspect_run_id':'123','inspected_source':'b'*40}
        run={'name':'G1 Split-Aware Staging Release','path':r.WORKFLOW,
             'head_branch':'feature/staging-preview','head_sha':'b'*40,'repository':{'full_name':r.REPO},
             'event':'push','status':'completed','conclusion':'success','actor':{'id':r.OWNER_ID},
             'triggering_actor':{'id':r.OWNER_ID},'updated_at':r.datetime.now(r.timezone.utc).isoformat(), 'run_number':50}
        artifact={'total_count':1,'artifacts':[{'id':456,'name':'staging-frontend-journey-release-50',
                                             'expired':False,'size_in_bytes':1000}]}
        saved={key:{'safe':True} for key in r.SNAPSHOT_FIELDS}
        saved.update(mode='inspect',decision='PREFLIGHT_PASS',source='b'*40,applicationBaseline=r.MERGED)
        if change: change(run,artifact,saved)
        archive=io.BytesIO()
        with zipfile.ZipFile(archive,'w') as z: z.writestr('release.json',json.dumps(saved))
        with patch.object(r,'api',side_effect=[run,artifact]), patch.object(r.subprocess,'check_output',return_value=archive.getvalue()) as command:
            result=r.inspection(request)
            self.assertEqual(command.call_args.args[0],['gh','api','/repos/'+r.REPO+'/actions/artifacts/456/zip'])
            self.assertEqual(command.call_args.kwargs['stderr'],subprocess.PIPE)
            return result

    def test_successful_real_run_artifact_binds_inspect_to_unchanged_source(self):
        self.assertEqual(self.evidence()['source'],'b'*40)

    def test_failed_skipped_foreign_stale_or_fake_inspect_rejected(self):
        changes=[lambda run,a,s:run.update(conclusion='skipped'), lambda run,a,s:run.update(conclusion='failure'),
                 lambda run,a,s:run.update(path='foreign.yml'),lambda run,a,s:run.update(head_sha='c'*40),
                 lambda run,a,s:run.update(event='pull_request'),lambda run,a,s:run.update(head_branch='main'),
                 lambda run,a,s:run.update(repository={'full_name':'foreign/repo'}),
                 lambda run,a,s:run.update(actor={'id':1}), lambda run,a,s:run.update(triggering_actor={'id':1}),
                 lambda run,a,s:run.update(updated_at='2020-01-01T00:00:00Z'),
                 lambda run,a,s:a.update(total_count=2),lambda run,a,s:a['artifacts'][0].update(expired=True),
                 lambda run,a,s:a['artifacts'][0].update(name='fake'),
                 lambda run,a,s:s.update(mode='release'),lambda run,a,s:s.update(decision='NO_GO'),
                 lambda run,a,s:s.update(source='c'*40),lambda run,a,s:s.update(applicationBaseline='a'*40)]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(RuntimeError): self.evidence(change)


class TriggerIsolation(unittest.TestCase):
    def test_marker_not_in_preparation_note_and_notification_gate_is_preserved(self):
        self.assertNotIn(Path(r.MARKER).read_text().strip(),r.INTENTS.values())
        notification=yaml.load(Path('.github/workflows/notification-alerts-native-ci.yml').read_text(),Loader=yaml.BaseLoader)
        self.assertIn(r.MARKER,notification['on']['push']['paths'])
        self.assertIn('feature/staging-preview',notification['on']['push']['branches'])
        self.assertNotIn('id-token',notification['permissions'])

    def test_existing_marker_pushes_cannot_start_other_cloud_mutations(self):
        import fnmatch
        # Evaluate the small expression subset actually used by existing cloud
        # jobs. Unknown syntax fails this audit; never assume it means false.
        for message in r.INTENTS.values():
            active=[]
            for path in Path('.github/workflows').glob('*.yml'):
                workflow=yaml.load(path.read_text(),Loader=yaml.BaseLoader)
                push=workflow.get('on',{}).get('push')
                if push is None: continue
                push=push or {}
                branches=push.get('branches',['*'])
                if not any(fnmatch.fnmatch('feature/staging-preview',b) for b in branches): continue
                if 'paths' in push and not any(fnmatch.fnmatch(r.MARKER,p) for p in push['paths']): continue
                for name,job in workflow.get('jobs',{}).items():
                    if not any(s.get('uses','').startswith('google-github-actions/auth@') for s in job.get('steps',[])): continue
                    if str(path)==r.WORKFLOW: continue
                    condition=job.get('if','true').removeprefix('${{').removesuffix('}}').strip()
                    for key,value in {'github.event_name':'push','github.ref':'refs/heads/feature/staging-preview',
                                      'github.repository':r.REPO,'github.event.head_commit.message':message}.items():
                        condition=condition.replace(key,repr(value))
                    condition=condition.replace('&&',' and ').replace('||',' or ')
                    if eval(condition,{'__builtins__':{},'contains':lambda a,b:b in a,'true':True,'false':False}):
                        active.append((path.name,name))
                        self.assertEqual((path.name,name),('staging-automation-pause.yml','inspect'))
                        self.assertEqual(job['steps'][-1]['run'],'python3 scripts/staging-automation-pause.py --phase read')
            # This pre-existing read-only job runs on EVERY staging push, under
            # its own group; changing marker path cannot eliminate it.
            self.assertEqual(active,[('staging-automation-pause.yml','inspect')])



class JourneyReleaseGuards(unittest.TestCase):
    def test_backend_contract_keeps_both_baseline_and_new_reviewed_source_binding(self):
        self.assertEqual(r.backend_contract().G1_SOURCE,r.MERGED)
        self.assertEqual(r.backend_contract().G1_APPROVED_SOURCE,r.APPROVED_SOURCE)
        for field in ['MERGED','APPROVED_SOURCE']:
            with self.subTest(field=field),patch.object(r,field,'b'*40),self.assertRaisesRegex(RuntimeError,'mismatch'):
                r.backend_contract()

    def test_journey_target_is_explicit_and_bound_to_inspection(self):
        with marker_checkout(payload=lambda data: {**data, 'target': 'journey'},
                             message=r.JOURNEY_INTENTS['inspect']) as f:
            self.assertEqual(r.activation()['target'], 'journey')
        with marker_checkout(payload=lambda data: {**data, 'target': 'journey'}) as f:
            with self.assertRaisesRegex(RuntimeError, 'intent mismatch'):
                r.activation()

    def test_backend_cloud_scope_cannot_change_admin_or_default_traffic(self):
        request = {'mode': 'release', 'target': 'journey'}
        with patch.object(r, 'activation', return_value=request), patch.dict(os.environ, {'RELEASE_MODE':'release', 'GITHUB_SHA':'a'*40}), patch.object(r.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{}', '')) as run:
            r.cloud('run','services','update-traffic',r.BACK,'--region',r.REGION,'--update-tags', 'diewish-test2='+r.USER_REV)
            run.reset_mock()
            for tail in [('--to-latest',), ('--to-revisions', r.ADMIN_REV+'=100'),
                         ('--update-tags', 'admin-legacy='+r.USER_REV), ('--remove-tags','admin-legacy')]:
                with self.assertRaises(RuntimeError):
                    r.cloud('run','services','update-traffic',r.BACK,'--region',r.REGION,*tail)
            run.assert_not_called()
        with patch.object(r,'activation',return_value={'mode':'inspect','target':'journey'}), patch.dict(os.environ,{'RELEASE_MODE':'inspect'}), patch.object(r.subprocess,'run') as run:
            with self.assertRaises(RuntimeError):
                r.backend_tag(r.USER_REV)
            run.assert_not_called()

    def test_candidate_runtime_cannot_change_db_flags_identity_or_startup(self):
        old=revision('old', {'STAGING_AUTOMATION_ENABLED':'false'}, {'DATABASE_URL':{'name':'test2','key':'1'}})
        old['spec']['containers'][0].update(command=['npm'], args=['start'])
        old['spec']['serviceAccountName']='existing-runtime'
        new=copy.deepcopy(old)
        new['spec']['containers'][0]['image']='new@sha256:digest'
        new['status']['imageDigest']='new@sha256:digest'
        new['spec']['containers'][0]['env'].append({'name':'DIEWISH_APPLICATION_SHA','value':'a'*40})
        r.same_runtime(old,new,'new@sha256:digest','a'*40)
        for mutate in [lambda obj:obj['spec'].update(serviceAccountName='foreign'),
                       lambda obj:obj['spec']['containers'][0].update(args=['run','start:migrate']),
                       lambda obj:obj['spec']['containers'][0]['env'][0].update(value='true'),
                       lambda obj:obj['spec']['containers'][0]['env'][1]['valueFrom']['secretKeyRef'].update(name='legacy')]:
            bad=copy.deepcopy(new); mutate(bad)
            with self.assertRaises(RuntimeError): r.same_runtime(old,bad,'new@sha256:digest','a'*40)

    def test_backend_build_passes_every_mandatory_source_evidence_input(self):
        contract=r.backend_contract(); sha='a'*40
        image=contract.IMAGE_PREFIX+sha
        subs={'_IMAGE':image,'_GIT_SHA':sha,'_SOURCE_HARNESS_SHA':r.APPROVED_SOURCE,
              '_SOURCE_MANIFEST_SHA256':contract.G1_APPROVED_MANIFEST,'_BACKEND_TREE':contract.G1_APPROVED_BACKEND,'_LOCK_SHA256':contract.G1_APPROVED_LOCK}
        result={'id':BuildGuards.build_id,'projectId':r.PROJECT,'status':'SUCCESS','substitutions':subs,
                'results':{'images':[{'name':image,'digest':'sha256:'+'b'*64}]}}
        saved={'source':sha,'test2':{'imageDigest':'old@sha256:x'}}
        with patch.object(r,'source',return_value=sha), patch.object(r,'save'), patch.object(r,'cloud',side_effect=[{'id':BuildGuards.build_id},result]) as cloud:
            r.build_backend(saved)
            self.assertEqual(cloud.call_args_list[0].args[4], contract.DEFINITION)
            self.assertIn('_SOURCE_MANIFEST_SHA256='+contract.G1_APPROVED_MANIFEST, cloud.call_args_list[0].args[6])
        for key in subs:
            bad=copy.deepcopy(result); bad['substitutions'].pop(key)
            with self.subTest(key=key), patch.object(r,'source',return_value=sha), patch.object(r,'save'), patch.object(r,'cloud',side_effect=[{'id':BuildGuards.build_id},bad]), self.assertRaises(RuntimeError):
                r.build_backend(saved)

    def test_journey_preacceptance_failure_never_reaches_frontend_build_or_cutover(self):
        saved={'source':'a'*40}
        request={'mode':'release','target':'journey','inspect_run_id':'123'}
        with patch.object(r,'activation',return_value=request), patch.dict(os.environ,{'RELEASE_MODE':'release'}), patch.object(r,'inspection',return_value={k:None for k in r.SNAPSHOT_FIELDS}), patch.object(r,'source',return_value='a'*40), patch.object(r,'gates'), patch.object(r,'unchanged'), patch.object(r,'prepare_backend',side_effect=RuntimeError('candidate acceptance failed')), patch.object(r,'build') as build, patch.object(r,'cloud') as cloud:
            with self.assertRaisesRegex(RuntimeError,'acceptance failed'): r.release(saved)
            build.assert_not_called(); cloud.assert_not_called()

    def test_journey_success_order_and_failed_web_acceptance_restore_both(self):
        original_context=release_context
        @contextmanager
        def journey_context(saved):
            with original_context(saved), patch.object(r,'activation',return_value={'mode':'release','target':'journey','inspect_run_id':'123'}):
                yield
        for problem in [None,'browser','uncertain_swap']:
            events=[]
            def prepare(saved):
                saved['new_backend']={'revision':'new-backend'}
                saved['test2']={'revision':'old-backend'}
                events.append('candidate-accepted')
            with patch.dict(globals(),{'release_context':journey_context}), patch.object(r,'prepare_backend',side_effect=prepare), patch.object(r,'backend_tag',side_effect=lambda value:events.append('activate-'+value)), patch.object(r,'journey_acceptance',side_effect=lambda base:events.append('public-accepted')), patch.object(r,'rollback_backend',side_effect=lambda saved:events.append('restore-old-backend')):
                saved,calls=Guards().run_release(problem)
            self.assertEqual(events[:2],['candidate-accepted','activate-new-backend'])
            if problem:
                self.assertEqual(events[-1],'restore-old-backend')
                self.assertEqual(calls[-1][-1],'real-serving-old=100')
            else:
                self.assertEqual(events[-1],'public-accepted')
                self.assertEqual(saved['decision'],'GO')

    def test_foreign_backend_tag_or_admin_cannot_be_overwritten_by_rollback(self):
        back=service([{'revisionName':r.ADMIN_REV,'percent':100,'tag':'admin-legacy','url':r.ADMIN},
                      {'revisionName':'foreign','tag':'diewish-test2','url':r.USER}])
        saved={'test2':{'revision':'old'},'new_backend':{'revision':'new'}}
        with patch.object(r,'service',return_value=back), patch.object(r,'revision'), patch.object(r,'check_backend'), patch.object(r,'backend_tag') as restore, self.assertRaisesRegex(RuntimeError,'foreign backend'):
            r.rollback_backend(saved)
        restore.assert_not_called()

    def test_no_migration_or_mascot_workflow_and_secret_is_release_only(self):
        workflow=yaml.load(Path(r.WORKFLOW).read_text(),Loader=yaml.BaseLoader)
        self.assertEqual(workflow['on']['workflow_dispatch']['inputs']['target']['options'],['journey'])
        steps=workflow['jobs']['cutover']['steps']
        secret=[step for step in steps if 'NEON_TEST2_DATABASE_URL' in step.get('env',{})]
        self.assertEqual(len(secret),1)
        expression=secret[0]['env']['NEON_TEST2_DATABASE_URL']
        self.assertIn("outputs.mode == 'release'",expression)
        self.assertIn("outputs.target == 'journey'",expression)
        code=Path('scripts/staging-frontend-release.py').read_text()
        for forbidden in ['mascot-split-release.py','mascot-test2-database.cjs','migrate deploy','start:migrate','DROP TABLE','TRUNCATE']:
            self.assertNotIn(forbidden,code)
        self.assertIn("'--command=npm', '--args=start'",code)
        self.assertIn("'backendAcceptanceVerified'",code)



    def test_real_candidate_prepare_requires_zero_traffic_unchanged_admin_and_acceptance(self):
        sha='a'*40
        flags={key:'false' for key in ['COACH_SYNC_ENABLED','STAGING_AUTOMATION_ENABLED','SCHEDULER_TRIGGER_ENABLED','NUTRITION_JOBS_ENABLED']}
        old=revision(r.USER_REV,flags,{'DATABASE_URL':{'name':'diewish-staging-test2-database-url','key':'1'}})
        old['spec'].update(serviceAccountName='diewish-staging-runtime@'+r.PROJECT+'.iam.gserviceaccount.com')
        old['spec']['containers'][0].update(command=['npm'],args=['start'])
        admin=revision(r.ADMIN_REV,secrets={'DATABASE_URL':{'name':'diewish-staging-database-url','key':'latest'}})
        original=service([{'revisionName':r.ADMIN_REV,'percent':100,'tag':'admin-legacy','url':r.ADMIN},
                          {'revisionName':r.USER_REV,'tag':'diewish-test2','url':r.USER}])
        for problem in [None,'traffic','admin','database','acceptance','existing']:
            before=copy.deepcopy(original); after=copy.deepcopy(before)
            candidate={'revisionName':r.BACK+'-new','tag':'g1-'+sha[:12],
                       'url':'https://g1-'+sha[:12]+'---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app'}
            after['status']['traffic'].append(candidate)
            if problem=='traffic': candidate['percent']=1
            if problem=='admin': after['status']['traffic'][0]['url']='https://foreign.invalid'
            if problem=='existing': before['status']['traffic'].append(candidate)
            new=copy.deepcopy(old);new['metadata']['name']=candidate['revisionName']
            new['spec']['containers'][0]['image']='new@sha256:test';new['status']['imageDigest']='new@sha256:test'
            new['spec']['containers'][0]['env'].append({'name':'DIEWISH_APPLICATION_SHA','value':sha})
            if problem=='database': new['spec']['containers'][0]['env'][-2]['valueFrom']['secretKeyRef']['name']='legacy'
            saved={'source':sha,'test2':r.info(old),'backendTraffic':r.rows(before)}
            calls=[0]
            def services(_):
                calls[0]+=1
                return before if calls[0]<=2 else after
            def build(s): s['newBackendImage']='new@sha256:test'
            def rev(name): return old if name==r.USER_REV else admin if name==r.ADMIN_REV else new
            with self.subTest(problem=problem), patch.dict(os.environ,{'GITHUB_SHA':sha}), patch.object(r,'journey_requested',return_value=True), patch.object(r,'build_backend',side_effect=build), patch.object(r,'backend_image_version'), patch.object(r,'gates'), patch.object(r,'unchanged'), patch.object(r,'service',side_effect=services), patch.object(r,'revision',side_effect=rev), patch.object(r,'save'), patch.object(r,'cloud') as cloud, patch.object(r,'journey_acceptance',side_effect=RuntimeError('bad acceptance') if problem=='acceptance' else None):
                if problem:
                    with self.assertRaises(RuntimeError): r.prepare_backend(saved)
                    self.assertNotIn('backendAcceptanceVerified',saved)
                else:
                    r.prepare_backend(saved)
                    self.assertTrue(saved['backendAcceptanceVerified'])
                self.assertFalse(any(c.args[:3]==('run','services','update-traffic') for c in cloud.call_args_list))
                if problem=='existing': cloud.assert_not_called()
                elif cloud.called:
                    args=cloud.call_args.args
                    self.assertIn('--no-traffic',args);self.assertIn('--command=npm',args);self.assertIn('--args=start',args)

    def test_closed_features_and_all_paused_schedulers_are_required(self):
        with patch.dict(os.environ,{'RELEASE_TARGET':'journey'}):
            for state in ['PAUSED','ENABLED']:
                with patch.object(r,'cloud',side_effect=[{'state':'PAUSED'},[{'name':'diewish-coach','state':state}]]) as cloud:
                    if state=='PAUSED': r.scheduler()
                    else:
                        with self.assertRaises(RuntimeError):r.scheduler()
                    self.assertTrue(all(c.args[0] in ['scheduler'] for c in cloud.call_args_list))

    def test_old_frontend_only_dispatch_cannot_publish_the_new_application(self):
        with marker_checkout() as f, patch.dict(os.environ,{'GITHUB_EVENT_NAME':'workflow_dispatch'}), patch.object(r,'cloud') as cloud:
            f['event']['inputs']={'mode':'release','target':'frontend','inspect_run_id':'123'};f['write_event']()
            with self.assertRaisesRegex(RuntimeError,'paired backend/frontend'):r.main('authorize')
            cloud.assert_not_called()

    def test_backend_image_requires_source_labels_generated_model_and_fixed_qs(self):
        contract=r.backend_contract();sha='a'*40
        labels={'io.diewish.source-kind':'composed','io.diewish.build-definition-sha':sha,
                'io.diewish.source-harness-sha':r.APPROVED_SOURCE,'io.diewish.source-manifest-sha256':contract.G1_APPROVED_MANIFEST,
                'io.diewish.backend-tree':contract.G1_APPROVED_BACKEND,'io.diewish.lock-sha256':contract.G1_APPROVED_LOCK}
        for problem in [None,'source','harness','lock','model','qs','minimatch']:
            actual=copy.deepcopy(labels);report={'qs':'6.16.1','minimatch':'11.0.1','states':['EATEN','PENDING','SKIPPED'],'checkIn':True}
            if problem=='source':actual['io.diewish.build-definition-sha']='b'*40
            if problem=='harness':actual['io.diewish.source-harness-sha']=r.MERGED
            if problem=='lock':actual['io.diewish.lock-sha256']='0'*64
            if problem=='model':report['states']=['EATEN','PENDING']
            if problem=='qs':report['qs']='6.16.0'
            if problem=='minimatch':report['minimatch']='3.1.5'
            saved={'source':sha,'newBackendImage':'image@sha256:test'}
            with self.subTest(problem=problem),patch.object(r.subprocess,'run') as run,patch.object(r.subprocess,'check_output',side_effect=['private-token',json.dumps(actual),json.dumps(report)]),patch.object(r,'save'):
                if problem:
                    with self.assertRaises(RuntimeError):r.backend_image_version(saved)
                else:r.backend_image_version(saved)
                self.assertTrue(all(c.kwargs.get('capture_output') for c in run.call_args_list))


if __name__ == '__main__':
    unittest.main()
