import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('mascot-split-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class RoutingSafety(unittest.TestCase):
    def back(self):
        return {'status': {'traffic': [
            {'revisionName': release.LEGACY, 'percent': 100},
            {'revisionName': release.LEGACY, 'tag': 'admin-legacy', 'url': release.ADMIN},
            {'revisionName': 'test2-revision', 'tag': 'diewish-test2', 'url': release.USER},
        ]}}

    def test_retains_legacy_and_test2_boundary(self):
        self.assertEqual(release.check_back(self.back()), 'test2-revision')

    def test_rejects_admin_tag_retarget_or_random_db_traffic(self):
        for mutate in [lambda rows: rows[1].update(revisionName='new-test2'),
                       lambda rows: rows[2].update(percent=1),
                       lambda rows: rows[0].update(percent=99),
                       lambda rows: rows[2].update(url=release.ADMIN),
                       lambda rows: rows.append(dict(rows[2]))]:
            value = self.back()
            mutate(value['status']['traffic'])
            with self.assertRaises(RuntimeError):
                release.check_back(value)

    def test_rejects_legacy_db_secret_and_automatic_migration_startup(self):
        env = [{'name': 'DATABASE_URL', 'valueFrom': {'secretKeyRef': {'name': release.SECRET, 'key': '1'}}}]
        env += [{'name': name, 'value': 'false'} for name in release.FLAGS]
        value = {'spec': {'containers': [{'env': env, 'command': ['npm'], 'args': ['start']}]}}
        release.check_test2(value)
        for name, item in [('DATABASE_URL', {'valueFrom': {'secretKeyRef': {'name': 'diewish-staging-database-url', 'key': 'latest'}}}),
                           ('DIRECT_DATABASE_URL', {'valueFrom': {'secretKeyRef': {'name': 'old-direct', 'key': '1'}}}),
                           ('STAGING_AUTOMATION_ENABLED', {'value': 'true'})]:
            changed = copy.deepcopy(value)
            changed['spec']['containers'][0]['env'] = [e for e in env if e['name'] != name] + [{'name': name, **item}]
            with self.assertRaises(RuntimeError):
                release.check_test2(changed)
        value['spec']['containers'][0]['args'] = ['start:migrate']
        with self.assertRaises(RuntimeError):
            release.check_test2(value)

    def test_failed_live_acceptance_restores_both_routes(self):
        saved = {'old_user': 'old-test2', 'old_front': 'old-router', 'new_user': 'new-test2', 'new_front': 'new-router'}
        with patch.object(release, 'unchanged', return_value=saved), patch.object(release, 'cloud') as cloud, \
             patch.object(release, 'ready', side_effect=RuntimeError('candidate failed')), \
             patch.object(release.time, 'sleep'):
            with self.assertRaises(RuntimeError):
                release.release()
            calls = [' '.join(c.args) for c in cloud.call_args_list]
            self.assertTrue(any('diewish-test2=old-test2' in c for c in calls))
            self.assertTrue(any('old-router=100' in c for c in calls))
            self.assertFalse(any('--to-revisions diewish-backend' in c for c in calls))

if __name__ == '__main__':
    unittest.main()
