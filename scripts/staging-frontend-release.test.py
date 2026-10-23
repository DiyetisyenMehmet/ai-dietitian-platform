"""Offline failure-path tests: no credentials, network, Docker or cloud calls."""
import copy
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
        with patch.object(r, 'gates', side_effect=RuntimeError('gate failed')), patch.object(r, 'cloud') as cloud, patch.object(r, 'build') as build:
            with self.assertRaises(RuntimeError):
                r.release({})
            cloud.assert_not_called()
            build.assert_not_called()

    def run_release(self, problem=None):
        saved = {'source': 'a'*40, 'old_frontend': {'revision': 'real-serving-old'},
                 'newImage': 'image@sha256:test', 'beforeHealth': {'baseline': True}}
        old = revision('real-serving-old', r.ROUTER)
        new = revision('new', {**r.ROUTER, 'DIEWISH_APPLICATION_SHA': saved['source']})
        candidate = service([{'revisionName':'real-serving-old','percent':100},
                             {'revisionName':'new','tag':'next-security-candidate','url':'https://candidate.invalid'}])
        restored = service([{'revisionName':'real-serving-old','percent':100}])
        calls = []
        def cloud(*args):
            calls.append(args)
            if problem == 'uncertain_swap' and args[:3] == ('run','services','update-traffic') and args[-1] == 'new=100':
                raise RuntimeError('uncertain response')
        def rev(name):
            return old if name == 'real-serving-old' else new
        def smoke():
            if problem == 'browser':
                raise RuntimeError('login failed')
        with patch.object(r, 'gates'), patch.object(r, 'build'), patch.object(r, 'image_version'), patch.object(r, 'save'), patch.object(r, 'unchanged', return_value=candidate), patch.object(r, 'cloud', side_effect=cloud), patch.object(r, 'revision', side_effect=rev), patch.object(r, 'get', return_value=(421,b'')), patch.object(r, 'live', return_value={'baseline':True}), patch.object(r, 'surfaces'), patch.object(r, 'browser_smoke', side_effect=smoke), patch.object(r, 'service', return_value=restored):
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


if __name__ == '__main__':
    unittest.main()
