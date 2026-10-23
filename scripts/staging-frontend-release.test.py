"""Offline failure-path tests: no credentials, network, Docker or cloud calls."""
import copy
import json
import os
import subprocess
from contextlib import redirect_stdout
from io import StringIO
import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('staging-frontend-release.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


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
        with patch.dict(os.environ, {'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r, 'source', return_value='a' * 40), patch.object(r, 'gates', side_effect=RuntimeError('gate failed')), patch.object(r, 'cloud') as cloud, patch.object(r, 'build') as build:
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
        with patch.dict(os.environ, {'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r, 'source', return_value=saved['source']), patch.object(r, 'gates'), patch.object(r, 'build'), patch.object(r, 'image_version'), patch.object(r, 'save'), patch.object(r, 'unchanged', return_value=candidate), patch.object(r, 'cloud', side_effect=cloud), patch.object(r, 'revision', side_effect=rev), patch.object(r, 'get', return_value=(200 if problem == 'wrong_host' else 421,b'')), patch.object(r, 'live', return_value={'baseline':True}), patch.object(r, 'surfaces'), patch.object(r, 'browser_smoke', side_effect=smoke), patch.object(r, 'service', return_value=restored):
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
        with patch.dict(os.environ, {'GITHUB_EVENT_NAME':'push','RELEASE_MODE':'release'}), patch.object(r,'cloud') as cloud:
            with self.assertRaisesRegex(RuntimeError,'explicit workflow_dispatch'):
                r.release({})
            cloud.assert_not_called()

    def test_diagnosis_has_no_build_or_deploy_path(self):
        with patch.object(r,'cloud',return_value=[] ) as cloud, patch.object(r,'save'), patch.object(r,'build') as build:
            saved={}
            r.diagnose(saved)
            build.assert_not_called()
            self.assertFalse(any(c.args[:2] == ('run','deploy') for c in cloud.call_args_list))
            self.assertEqual(saved['decision'],'READ_ONLY_DIAGNOSIS_COMPLETE')

    def test_workflow_push_and_pr_have_no_cloud_identity_or_commit_triggers(self):
        workflow=Path('.github/workflows/staging-auth-a2-frontend-only.yml').read_text()
        self.assertNotIn('head_commit',workflow)
        self.assertNotIn('[frontend-next-',workflow)
        self.assertIn('  pull_request:',workflow)
        offline, cutover=workflow.split('  cutover:')
        self.assertNotIn('id-token: write',offline)
        self.assertNotIn('google-github-actions',offline)
        self.assertIn("github.event_name == 'workflow_dispatch'",cutover)
        self.assertIn('needs: offline-guards',cutover)
        self.assertIn('RELEASE_MODE: ${{ inputs.mode }}',cutover)
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
    def check(self, sha='a'*40, ref='refs/heads/feature/staging-preview', remote=None,
              changed='', ancestor=0, checkout=None, dirty=''):
        def output(cmd, **kwargs):
            if cmd[1] == 'rev-parse': return checkout or sha
            if cmd[1] == 'status': return dirty
            if cmd[1] == 'diff': return changed
            raise AssertionError(cmd)
        with patch.dict(os.environ, {'GITHUB_SHA':sha,'GITHUB_REF':ref}), patch.object(r,'api',return_value={'object':{'sha':remote or sha}}), patch.object(r.subprocess,'check_output',side_effect=output), patch.object(r.subprocess,'run',return_value=subprocess.CompletedProcess([],ancestor)):
            return r.source()

    def test_reviewed_baseline_and_release_only_whitelist(self):
        self.assertEqual(r.MERGED,'8ee4c2021303a0dcbfca34aeff4511794d76d71b')
        self.assertEqual(self.check(changed='\n'.join(sorted(r.PREP_FILES))), 'a'*40)
        self.assertEqual(len(r.PREP_FILES),4)

    def test_app_auth_dependency_or_non_release_drift_rejected(self):
        for path in ['frontend/src/app/dashboard/page.tsx','frontend/package-lock.json',
                     'backend/src/auth.ts','.github/workflows/staging-notification-test-apk.yml']:
            with self.subTest(path=path), self.assertRaisesRegex(RuntimeError,'application drift'):
                self.check(changed=path)

    def test_wrong_sha_ref_staging_advance_checkout_or_baseline_rejected(self):
        for kwargs in [{'sha':'abc'},{'sha':'A'*40},{'sha':'a'*40+';'},
                       {'ref':'refs/heads/main'},{'remote':'b'*40}, {'ancestor':1},
                       {'checkout':'b'*40},{'dirty':' M scripts/staging-frontend-release.py'}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(RuntimeError): self.check(**kwargs)


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
        for problem in ['missing','failure','cancelled','skipped','wrong_sha','wrong_workflow','pr',
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
            bundle.write_text('"data-journey-plan-meal data-journey-next data-journey-progress-area"')
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
        with patch.dict(os.environ,{'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r,'source',return_value=self.sha), patch.object(r,'gates',side_effect=[None,RuntimeError('NO_GO: gate changed')]), patch.object(r,'unchanged'), patch.object(r,'build'), patch.object(r,'image_version'), patch.object(r,'cloud') as cloud:
            with self.assertRaisesRegex(RuntimeError,'gate changed'): r.release({'source':self.sha})
            cloud.assert_not_called()

    def test_build_or_image_failure_prevents_candidate_deploy(self):
        for function in ['build','image_version']:
            with patch.dict(os.environ,{'GITHUB_EVENT_NAME':'workflow_dispatch','RELEASE_MODE':'release'}), patch.object(r,'source',return_value=self.sha), patch.object(r,'gates'), patch.object(r,'unchanged'), patch.object(r,'build'), patch.object(r,'image_version'), patch.object(r,function,side_effect=RuntimeError('NO_GO: mismatch')), patch.object(r,'cloud') as cloud:
                with self.assertRaises(RuntimeError): r.release({'source':self.sha})
                cloud.assert_not_called()


if __name__ == '__main__':
    unittest.main()
