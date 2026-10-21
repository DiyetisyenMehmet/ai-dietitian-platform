"""Release the existing mascot collection while retaining #90's Admin/Test2 split."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error

PROJECT = 'project-a2e260c1-839d-4f1d-b90'
REGION = 'europe-west1'
BACK = 'diewish-backend-staging'
FRONT = 'diewish-frontend-staging'
LEGACY = 'diewish-backend-staging-00479-w44'
SECRET = 'diewish-staging-test2-database-url'
ADMIN = 'https://admin-legacy---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app'
USER = 'https://diewish-test2---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app'
CANDIDATE = 'https://mascot-candidate---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app'
APP = 'https://staging.diewish.com'
ADMIN_APP = 'https://admin-staging.diewish.com'
FLAGS = ['COACH_SYNC_ENABLED', 'STAGING_AUTOMATION_ENABLED', 'SCHEDULER_TRIGGER_ENABLED', 'NUTRITION_JOBS_ENABLED']

def cloud(*args, output=True):
    result = subprocess.run(['gcloud', *args, '--project', PROJECT, '--format=json', '--quiet'],
                            capture_output=True, text=True, timeout=600)
    if result.returncode:
        # Cloud output can contain configuration. Do not emit unfiltered stderr.
        raise RuntimeError('Cloud operation failed: ' + ' '.join(args[:3]))
    return json.loads(result.stdout) if output and result.stdout.strip() else None

def service(name):
    return cloud('run', 'services', 'describe', name, '--region', REGION)

def revision(name):
    return cloud('run', 'revisions', 'describe', name, '--region', REGION)

def traffic(obj):
    return obj['status']['traffic']

def tagged(obj, name):
    rows = [r for r in traffic(obj) if r.get('tag') == name]
    if len(rows) != 1:
        raise RuntimeError('Required exact tag missing/ambiguous: ' + name)
    return rows[0]

def serving(obj):
    rows = [r for r in traffic(obj) if r.get('percent', 0) > 0]
    if len(rows) != 1 or rows[0].get('percent') != 100:
        raise RuntimeError('Serving traffic must be one explicit revision at 100%')
    return rows[0]['revisionName']

def environment(obj):
    return {e['name']: e for e in obj['spec']['containers'][0].get('env', [])}

def flag(env, name):
    return env.get(name, {}).get('value')

def ref(env, name):
    return env.get(name, {}).get('valueFrom', {}).get('secretKeyRef', {})

def check_back(obj):
    if serving(obj) != LEGACY or tagged(obj, 'admin-legacy')['revisionName'] != LEGACY or tagged(obj, 'admin-legacy')['url'] != ADMIN:
        raise RuntimeError('Legacy Admin routing drift')
    target = tagged(obj, 'diewish-test2')
    if target['url'] != USER or target.get('percent', 0) != 0:
        raise RuntimeError('Test2 tag must have zero default traffic')
    return target['revisionName']

def check_test2(obj, sha=None):
    env = environment(obj)
    if ref(env, 'DATABASE_URL') != {'name': SECRET, 'key': '1'}:
        raise RuntimeError('Test2 secret/version mismatch')
    direct = ref(env, 'DIRECT_DATABASE_URL')
    if direct and direct != {'name': SECRET, 'key': '1'}:
        raise RuntimeError('Foreign direct DB reference')
    if any(flag(env, key) != 'false' for key in FLAGS):
        raise RuntimeError('Background automation must remain disabled')
    if sha and flag(env, 'DIEWISH_APPLICATION_SHA') != sha:
        raise RuntimeError('Candidate application source mismatch')
    if obj['spec']['containers'][0].get('command') != ['npm'] or obj['spec']['containers'][0].get('args') != ['start']:
        raise RuntimeError('Runtime must not run automatic migrations')

def check_front(obj):
    env = environment(obj)
    expected = {'DIEWISH_STAGING_HOST_ROUTING_ENABLED': 'true',
                'DIEWISH_STAGING_ADMIN_API_ORIGIN': ADMIN,
                'DIEWISH_STAGING_USER_API_ORIGIN': USER}
    if any(flag(env, key) != value for key, value in expected.items()):
        raise RuntimeError('Host router contract mismatch')

def scheduler():
    jobs = cloud('scheduler', 'jobs', 'list', '--location', REGION)
    selected = [j for j in jobs if j['name'].split('/')[-1].startswith('diewish')]
    if not selected or any(j.get('state') != 'PAUSED' for j in selected):
        raise RuntimeError('Staging scheduler must stay PAUSED')

def current_source():
    request = urllib.request.Request('https://api.github.com/repos/DiyetisyenMehmet/ai-dietitian-platform/git/ref/heads/feature/staging-preview',
                                     headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                                              'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if json.load(response)['object']['sha'] != os.environ['GITHUB_SHA']:
            raise RuntimeError('Staging source advanced; refuse stale release')

def health(url):
    try:
        with urllib.request.urlopen(url + '/api/health/ready', timeout=40) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            value = json.loads(raw)
        except ValueError:
            value = {}
        return error.code, value

def ready(url):
    status, data = health(url)
    if status != 200 or data.get('data', {}).get('checks', {}).get('database') != 'up':
        raise RuntimeError('Test2 backend not ready')

def admin_equal():
    a, b = health(ADMIN_APP), health(ADMIN)
    def semantic(value):
        code, data = value
        return code, data.get('success'), data.get('error', {}).get('code'), data.get('error', {}).get('details'), data.get('data', {}).get('checks')
    if semantic(a) != semantic(b):
        raise RuntimeError('Admin no longer matches its original backend')
    print('PASS: Admin host equals immutable legacy backend; existing quota failure is not a login PASS')

def state_path():
    return Path(os.environ['RUNNER_TEMP']) / 'mascot-release-snapshot.json'

def inspect():
    if not Path('.github/staging-test2-split-active').exists():
        raise RuntimeError('Missing split sentinel')
    current_source()
    back, front = service(BACK), service(FRONT)
    old_user, old_front = check_back(back), serving(front)
    check_test2(revision(old_user))
    check_front(revision(old_front))
    old_env = environment(revision(LEGACY))
    if ref(old_env, 'DATABASE_URL').get('name') != 'diewish-staging-database-url':
        raise RuntimeError('Original Admin secret mismatch')
    scheduler()
    ready(APP)
    admin_equal()
    snapshot = {'old_user': old_user, 'old_front': old_front, 'legacy': LEGACY}
    state_path().write_text(json.dumps(snapshot))
    print('PASS: fresh split preflight ' + json.dumps(snapshot))

def unchanged():
    saved = json.loads(state_path().read_text())
    if check_back(service(BACK)) != saved['old_user'] or serving(service(FRONT)) != saved['old_front']:
        raise RuntimeError('Concurrent serving change; abort')
    current_source()
    scheduler()
    return saved

def build():
    sha = os.environ['GITHUB_SHA']
    for kind, config in [('backend', 'backend-test2-buildonly'), ('frontend', 'frontend-staging')]:
        image = f'{REGION}-docker.pkg.dev/{PROJECT}/diewish-staging/{kind}:mascot-{sha}'
        substitutions = f'_IMAGE={image},_GIT_SHA={sha}'
        if kind == 'frontend':
            substitutions += ',_API_BASE_URL=/api,_SITE_URL=' + APP + ',_API_PROXY_TARGET=https://invalid-legacy-fallback.invalid'
        result = cloud('builds', 'submit', '--no-source', '--config', '.github/cloudbuild/' + config + '.yaml',
                       '--substitutions', substitutions, '--async')
        identifier = result['id']
        for _ in range(180):
            status = cloud('builds', 'describe', identifier)['status']
            if status == 'SUCCESS':
                print('PASS: immutable ' + kind + ' image built at ' + sha)
                break
            if status not in ['QUEUED', 'WORKING', 'PENDING']:
                raise RuntimeError('Cloud image build failed: ' + status)
            time.sleep(5)
        else:
            raise RuntimeError('Cloud build timed out')

def prepare():
    saved = unchanged()
    sha = os.environ['GITHUB_SHA']
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/diewish-staging/backend:mascot-{sha}'
    cloud('run', 'deploy', BACK, '--region', REGION, '--image', image, '--no-traffic', '--tag', 'mascot-candidate',
          '--service-account', f'diewish-staging-runtime@{PROJECT}.iam.gserviceaccount.com',
          '--command=npm', '--args=start', '--update-secrets', f'DATABASE_URL={SECRET}:1,DIRECT_DATABASE_URL={SECRET}:1',
          '--update-env-vars', 'DIEWISH_APPLICATION_SHA=' + sha + ',DIEWISH_ENVIRONMENT=staging,' + ','.join(x + '=false' for x in FLAGS), '--min=0', output=False)
    back = service(BACK)
    candidate = tagged(back, 'mascot-candidate')
    if check_back(back) != saved['old_user'] or candidate.get('percent', 0) != 0 or candidate['url'] != CANDIDATE:
        raise RuntimeError('Candidate backend boundary failed')
    check_test2(revision(candidate['revisionName']), sha)
    ready(CANDIDATE)
    result = subprocess.run(['python3', 'scripts/mascot-live-acceptance.py', CANDIDATE], check=False)
    if result.returncode:
        raise RuntimeError('Candidate acceptance failed; serving unchanged')
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/diewish-staging/frontend:mascot-{sha}'
    cloud('run', 'deploy', FRONT, '--region', REGION, '--image', image, '--no-traffic', '--tag', 'mascot-router-candidate',
          '--update-env-vars', 'DIEWISH_STAGING_HOST_ROUTING_ENABLED=true,DIEWISH_STAGING_ADMIN_API_ORIGIN=' + ADMIN + ',DIEWISH_STAGING_USER_API_ORIGIN=' + USER + ',NEXT_PUBLIC_API_BASE_URL=/api', '--min=0', output=False)
    front = service(FRONT)
    candidate_front = tagged(front, 'mascot-router-candidate')
    if serving(front) != saved['old_front'] or candidate_front.get('percent', 0) != 0:
        raise RuntimeError('Candidate frontend changed serving prematurely')
    check_front(revision(candidate_front['revisionName']))
    if health(candidate_front['url'])[0] != 421:
        raise RuntimeError('Frontend canonical host must fail closed')
    saved.update(new_user=candidate['revisionName'], new_front=candidate_front['revisionName'])
    state_path().write_text(json.dumps(saved))
    print('PASS: both exact-source candidate images prepared without serving change')

def release():
    saved = unchanged()
    changed = False
    try:
        # Mark before attempting mutation: an uncertain API response also requires rollback.
        changed = True
        cloud('run', 'services', 'update-traffic', BACK, '--region', REGION,
              '--update-tags', 'diewish-test2=' + saved['new_user'], output=False)
        cloud('run', 'services', 'update-traffic', FRONT, '--region', REGION,
              '--to-revisions', saved['new_front'] + '=100', output=False)
        for attempt in range(18):
            try:
                ready(APP)
                # New asset proves the custom domain serves the collection image.
                with urllib.request.urlopen(APP + '/images/mascots/nox/still.webp', timeout=35) as response:
                    expected = Path('frontend/public/images/mascots/nox/still.webp').read_bytes()
                    if response.read() != expected:
                        raise RuntimeError('New frontend image not serving')
                break
            except Exception:
                if attempt == 17:
                    raise
                time.sleep(5)
        result = subprocess.run(['python3', 'scripts/mascot-live-acceptance.py', APP], check=False)
        if result.returncode:
            raise RuntimeError('Public mascot acceptance failed')
        admin_equal()
        if check_back(service(BACK)) != saved['new_user'] or serving(service(FRONT)) != saved['new_front']:
            raise RuntimeError('Post-release runtime identity mismatch')
        scheduler()
        print('PASS: collection released; ' + json.dumps(saved))
        print('PASS: old Admin/production untouched, Test2 only, schedulers PAUSED')
    except BaseException:
        if changed:
            print('ROLLBACK: restoring previous Test2 tag and split-aware frontend, retaining expanded compatible CHECK constraint')
            failures = []
            for name, args in [('backend tag', ['--update-tags', 'diewish-test2=' + saved['old_user']]),
                               ('frontend', ['--to-revisions', saved['old_front'] + '=100'])]:
                try:
                    cloud('run', 'services', 'update-traffic', BACK if name == 'backend tag' else FRONT,
                          '--region', REGION, *args, output=False)
                except Exception:
                    failures.append(name)
            if failures:
                print('CRITICAL: rollback needs manual recovery: ' + ', '.join(failures))
        raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['inspect', 'build', 'prepare', 'release', 'unchanged'])
    try:
        globals()[parser.parse_args().phase]()
    except Exception as error:
        print('NO_GO: ' + str(error))
        raise SystemExit(1)
