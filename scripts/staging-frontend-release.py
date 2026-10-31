"""Existing #103 split release: explicit Journey backend + frontend, never schema or IAM.

Inspect is read-only. Owner admission, exact-source gates and prior inspection
bind the release. Legacy frontend-only activation cannot publish the new G1.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

PROJECT = 'project-a2e260c1-839d-4f1d-b90'
REGION = 'europe-west1'
REPO = 'DiyetisyenMehmet/ai-dietitian-platform'
MERGED = '51ba9fcef7cff7627792303584448c91b05d70dd'
# PR #135: reviewed application source, independent of the original G1 baseline.
APPROVED_SOURCE = '0ab4fab4f1cec0ea611759fd92df154f27ccd12f'
APPROVED_ENTRIES = {
    '.github/workflows/hardening-ci.yml': '100644 blob af3e54266fecac05a89bcc12764b5c58178d64c1',
    'backend/Dockerfile': '100644 blob 6739fcc58c0e16050c6380a8fd5aba2b1462354f',
    'backend/package-lock.json': '100644 blob 527c1a8c4c43b99872d72a1c9f2f0ecd4969324a',
    'backend/package.json': '100644 blob 0b7766c93c05c31bf139083c16c43a7adb060d77',
    'backend/vendor/minimatch-compat/index.cjs': '100644 blob 9ff0f1bdc126703d5f5ac64513674ef1d0a5443a',
    'backend/vendor/minimatch-compat/package.json': '100644 blob 2e5fc1f012de69bdd53005bceb8a7b3e6d92fbd2',
    'frontend/Dockerfile': '100644 blob 6f0a83a0f30b1bd3395edbb77bca9849d161ecfe',
    'frontend/e2e/dashboard-edit-sanity.spec.ts': '100644 blob cebaa07114d719edd35cfcdf427ad8ae0bfda18e',
    'frontend/package-lock.json': '100644 blob a180950147d61b9126b3f7fd8518af6ae763d136',
    'frontend/package.json': '100644 blob 389e2f0811f9e0c350b63fde2d4a4dcbcefcd797',
    'frontend/vendor/minimatch-compat/index.cjs': '100644 blob 9ff0f1bdc126703d5f5ac64513674ef1d0a5443a',
    'frontend/vendor/minimatch-compat/package.json': '100644 blob 2e5fc1f012de69bdd53005bceb8a7b3e6d92fbd2',
    'scripts/minimatch-security.test.cjs': '100644 blob cacff68e91770d6e133a87cd78c131a7f66fc7b6',
    'scripts/staging-frontend-release.test.py': '100644 blob bf8bac150496812002bcf6735a3cb2c70559b5b0',
}
# The release-test file is also changed by this separately reviewed guard PR.
# Pin those new bytes; all other PR #135 entries must remain exactly unchanged.
APPROVED_CURRENT_ENTRIES = {
    **APPROVED_ENTRIES,
    'scripts/staging-frontend-release.test.py': '100644 blob 2757ffec4dbab46a0fa08a699b3c57dac96caecc',
}
OWNER = 'DiyetisyenMehmet'
OWNER_ID = 301813832
WORKFLOW = '.github/workflows/staging-auth-a2-frontend-only.yml'
MARKER = '.github/staging-deploy-trigger'
INTENTS = {'inspect': 'G1 frontend inspect', 'release': 'G1 frontend release'}
JOURNEY_INTENTS = {'inspect': 'G1 Journey inspect', 'release': 'G1 Journey release'}
SNAPSHOT_FIELDS = ['old_frontend', 'backendTraffic', 'backendSpecFingerprint', 'admin', 'test2', 'beforeHealth']
# Deny the historic security-only image even if a build reports a new source.
RETIRED_DIGEST = 'sha256:b2de3f9d240cc1adf41e211f974c0b636c7a0bd52fae545e821ebc5b232692d7'
CHECKS = {'Hardening CI': '.github/workflows/hardening-ci.yml',
          'Notification preferences platform checks': '.github/workflows/notification-alerts-native-ci.yml',
          'Staging Config CI': '.github/workflows/staging-config-ci.yml'}
HARDENING_JOBS = {'frontend', 'backend', 'android-native', 'browser-e2e',
                  'Dependency vulnerability gate / osv-scan'}
BACK = 'diewish-backend-staging'
FRONT = 'diewish-frontend-staging'
CANDIDATE_TAG = 'next-sec'
ADMIN_REV = 'diewish-backend-staging-00479-w44'
USER_REV = 'diewish-backend-staging-00481-biq'
ADMIN = 'https://admin-legacy---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app'
USER = 'https://diewish-test2---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app'
APP = 'https://staging.diewish.com'
ADMIN_APP = 'https://admin-staging.diewish.com'
ROUTER = {'DIEWISH_STAGING_HOST_ROUTING_ENABLED': 'true',
          'DIEWISH_STAGING_ADMIN_API_ORIGIN': ADMIN,
          'DIEWISH_STAGING_USER_API_ORIGIN': USER,
          'NEXT_PUBLIC_API_BASE_URL': '/api'}
PREP_FILES = {'.github/workflows/staging-auth-a2-frontend-only.yml',
              '.github/cloudbuild/frontend-staging.yaml',
              'scripts/staging-frontend-release.py',
              'scripts/staging-frontend-release.test.py',
              'scripts/journey-live-acceptance.cjs', 'scripts/journey-live-acceptance.test.cjs',
              'scripts/test2-security-build-context.py', 'scripts/test2-security-build-context.test.py', MARKER}
ASSETS = ['brands/diewish-id-transparent-approved.png',
          'brands/diewish-wordmark-approved.png',
          'brands/diewish-wordmark-dark-approved.png',
          'images/mascots/mirmir/still-a4.png',
          'images/mascots/mirmir/eyes-closed.webp',
          'images/mascots/dost/still.webp']


def require(ok, reason):
    if not ok:
        raise RuntimeError('NO_GO: ' + reason)


def safe_error(text):
    """Keep actionable CLI diagnostics, never credentials or complete URLs."""
    text = re.sub(r'(?i)\b(?:https?|postgres(?:ql)?|mysql|redis)://[^\s\]<>]+', '[URL_REDACTED]', text)
    text = re.sub(r'(?i)\bBearer\s+\S+', 'Bearer [REDACTED]', text)
    text = re.sub(r'\b(?:AIza[\w-]+|ya29\.[\w.-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b', '[TOKEN_REDACTED]', text)
    text = re.sub(r'[\w.+-]+@[\w.-]+', '[EMAIL_REDACTED]', text)
    lines = []
    for line in text.splitlines():
        if re.search(r'(?i)(?:password|authorization|cookie|database_url|direct_database_url|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]', line):
            line = '[SENSITIVE_VALUE_LINE_REDACTED]'
        if re.search(r'(?i)error|denied|invalid|quota|memory|cpu|limit|argument|permission|request|operation|redacted', line):
            lines.append(line[:700])
    return lines[:10] or ['No safe diagnostic line available']


def failure_details(args, result):
    raw = result.stderr or result.stdout or ''
    category = next((name for pattern, name in [
        (r'PERMISSION_DENIED|permission.*denied|iam\.serviceAccounts\.actAs', 'PERMISSION_DENIED'),
        (r'RESOURCE_EXHAUSTED|quota', 'QUOTA_OR_RESOURCE_LIMIT'),
        (r'INVALID_ARGUMENT|unrecognized arguments|Invalid value|must be|too long|cannot exceed', 'INVALID_ARGUMENT'),
        (r'FAILED_PRECONDITION', 'FAILED_PRECONDITION'),
        (r'NOT_FOUND|not found', 'NOT_FOUND')]
        if re.search(pattern, raw, re.I)), 'UNCLASSIFIED')
    ids = sorted(set(re.findall(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', raw, re.I)))
    data = {'command': ' '.join(args[:3]), 'exitCode': result.returncode,
            'classification': category, 'requestOrOperationIds': ids,
            'stderr': safe_error(raw)}
    print('GCP_DIAGNOSTIC ' + json.dumps(data), flush=True)
    if args[:2] == ('run', 'deploy'):
        directory = Path(os.environ['RUNNER_TEMP']) / 'frontend-release-evidence'
        directory.mkdir(exist_ok=True)
        (directory / 'gcloud-failure.json').write_text(json.dumps(data, indent=2))
    return data


def cloud(*args, optional=False):
    # Only the explicit FRONT service may be mutated. No arbitrary shell command.
    if args[:2] == ('run', 'deploy'):
        if args[2] == BACK:
            require(journey_requested() and '--no-traffic' in args and '--command=npm' in args
                    and '--args=start' in args and '--tag' in args
                    and args[args.index('--tag') + 1] == backend_candidate_tag(), 'unsafe backend deploy')
        else:
            require(args[2] == FRONT and '--no-traffic' in args, 'unsafe deploy target')
    elif args[:3] == ('run', 'services', 'update-traffic'):
        require(args[3] == FRONT or (args[3] == BACK and journey_requested()
                and len(args) == 8 and args[4:7] == ('--region', REGION, '--update-tags')
                and re.fullmatch('diewish-test2=' + BACK + '-[a-z0-9-]+', args[7])), 'unsafe traffic target')
    else:
        require(args[:3] in [('run', 'services', 'describe'), ('run', 'revisions', 'describe'),
                            ('run', 'revisions', 'list'), ('scheduler', 'jobs', 'describe'), ('scheduler', 'jobs', 'list'), ('builds', 'submit', '--no-source')]
                or args[:2] in [('builds', 'describe'), ('logging', 'read')], 'unapproved cloud operation')
    p = subprocess.run(['gcloud', *args, '--project', PROJECT, '--format=json', '--quiet'],
                       capture_output=True, text=True, timeout=600, check=False)
    if p.returncode:
        data = failure_details(args, p)
        if optional:
            return None
        raise RuntimeError('NO_GO: cloud command failed; exit=' + str(p.returncode) + '; ' + data['classification'])
    return json.loads(p.stdout) if p.stdout.strip() else None


def api(path):
    req = urllib.request.Request('https://api.github.com/repos/' + REPO + path,
                                 headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                                          'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def source():
    require(os.environ.get('GITHUB_REPOSITORY') == REPO, 'wrong repository')
    sha = os.environ['GITHUB_SHA']
    require(re.fullmatch('[a-f0-9]{40}', sha) is not None, 'invalid source SHA')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/feature/staging-preview', 'wrong ref')
    require(api('/git/ref/heads/feature/staging-preview')['object']['sha'] == sha, 'staging advanced')
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == sha, 'checkout/source mismatch')
    require(not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip(), 'dirty release checkout')
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', MERGED, sha], check=False).returncode == 0,
            'reviewed application baseline is not an ancestor')
    require(subprocess.run(['git', 'merge-base', '--is-ancestor', APPROVED_SOURCE, sha], check=False).returncode == 0,
            'approved security source is not an ancestor')
    changed = subprocess.check_output(['git', 'diff', '--name-only', MERGED, sha], text=True).splitlines()
    approved_test = 'frontend/e2e/admin-entitlement-operations.spec.js'
    require(set(changed) <= PREP_FILES | {approved_test} | set(APPROVED_ENTRIES),
            'application drift since reviewed Journey merge')
    for ref, entries in [(APPROVED_SOURCE, APPROVED_ENTRIES), (sha, APPROVED_CURRENT_ENTRIES)]:
        for path, expected in entries.items():
            entry = subprocess.check_output(['git', 'ls-tree', '-z', '--full-tree', ref, '--', path], text=True)
            require(entry == expected + '\t' + path + '\0', 'unapproved G1 source tree entry: ' + path)
    if approved_test in changed:
        # PR #133 permits exactly this regular-file entry, not an Admin/test directory.
        entry = subprocess.check_output(['git', 'ls-tree', '-z', '--full-tree', sha, '--', approved_test], text=True)
        require(entry == '100644 blob 503fc08f916c089cf5a06408f88e69a23efb9fe0\t' + approved_test + '\0',
                'unapproved Admin test tree entry')
    pkg = json.loads(Path('frontend/package.json').read_text())
    lock = json.loads(Path('frontend/package-lock.json').read_text())
    require(pkg['dependencies']['next'] == '15.5.28' and
            lock['packages']['node_modules/next']['version'] == '15.5.28', 'Next version mismatch')
    require(Path('.github/staging-test2-split-active').is_file(), 'split sentinel missing')
    return sha


def identity():
    require(os.environ.get('GITHUB_REPOSITORY') == REPO, 'wrong repository')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/feature/staging-preview', 'wrong ref')
    require(os.environ.get('GITHUB_ACTOR') == OWNER and
            os.environ.get('GITHUB_TRIGGERING_ACTOR') == OWNER and
            os.environ.get('GITHUB_ACTOR_ID') == str(OWNER_ID), 'unauthorized release actor')


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate marker field')
        result[key] = value
    return result


def activation():
    """Read-only admission before any cloud identity; ordinary pushes/PRs emit no mode."""
    event_name = os.environ.get('GITHUB_EVENT_NAME')
    if event_name not in ['push', 'workflow_dispatch']:
        return None
    event_path = os.environ.get('GITHUB_EVENT_PATH')
    require(event_path and Path(event_path).is_file(), 'release requires explicit workflow_dispatch or verified marker event')
    event = json.loads(Path(event_path).read_text())
    if event_name == 'push' and event.get('head_commit', {}).get('message') not in [*INTENTS.values(), *JOURNEY_INTENTS.values()]:
        return None
    identity()
    require(event.get('repository', {}).get('full_name') == REPO and
            event.get('sender', {}).get('login') == OWNER and
            event.get('sender', {}).get('id') == OWNER_ID, 'event identity mismatch')
    if event_name == 'workflow_dispatch':
        inputs = event.get('inputs', {})
        mode = inputs.get('mode')
        target = inputs.get('target', 'frontend')
        require(mode in INTENTS, 'invalid explicit dispatch mode')
        run_id = inputs.get('inspect_run_id', '')
        base = os.environ['GITHUB_SHA']
    else:
        sha = os.environ['GITHUB_SHA']
        require(re.fullmatch('[a-f0-9]{40}', sha) is not None, 'invalid activation SHA')
        require(event.get('ref') == os.environ['GITHUB_REF'] and event.get('after') == sha and
                event.get('forced') is False and event.get('deleted') is False and
                event.get('created') is False, 'unsafe marker push')
        commits = event.get('commits', [])
        require(len(commits) == 1 and commits[0].get('id') == sha and
                event.get('head_commit', {}).get('id') == sha, 'marker requires one explicit commit')
        parents = subprocess.check_output(['git', 'rev-list', '--parents', '-n', '1', sha], text=True).split()
        require(len(parents) == 2 and parents[0] == sha and parents[1] == event.get('before'),
                'merge or multi-commit marker rejected')
        base = parents[1]
        changed = subprocess.check_output(['git', 'diff', '--name-status', base, sha], text=True).splitlines()
        require(changed == ['M\t' + MARKER], 'activation must modify only the existing marker')
        entry = subprocess.check_output(['git', 'ls-tree', sha, '--', MARKER], text=True)
        require(entry.startswith('100644 blob '), 'marker must be a regular file')
        require(api('/commits/' + sha + '/pulls') == [], 'PR-associated marker commit rejected')
        data = json.loads(Path(MARKER).read_text(), object_pairs_hook=unique_object)
        mode = data.get('mode')
        target = data.get('target', 'frontend')
        intents = JOURNEY_INTENTS if target == 'journey' else INTENTS
        require(mode in intents and event['head_commit']['message'] == intents[mode], 'marker intent mismatch')
        keys = {'version', 'mode', 'source_sha'} | ({'target'} if 'target' in data else set()) | ({'inspect_run_id'} if mode == 'release' else set())
        require(set(data) == keys and type(data['version']) is int and data['version'] == 1 and
                data['source_sha'] == base, 'invalid marker schema/source')
        run_id = str(data.get('inspect_run_id', ''))
        require(mode != 'release' or type(data['inspect_run_id']) is int, 'invalid inspect run id')
    require(mode != 'release' or re.fullmatch('[1-9][0-9]{0,19}', run_id) is not None,
            'release requires an explicit prior inspect run id')
    require(target in ['frontend', 'journey'], 'invalid release target')
    require(mode != 'release' or target == 'journey', 'G1 requires paired backend/frontend release')
    require(not os.environ.get('RELEASE_TARGET') or os.environ['RELEASE_TARGET'] == target, 'target mismatch')
    expected = os.environ.get('RELEASE_MODE')
    require(not expected or expected == mode, 'requested mode differs from verified activation')
    return {'mode': mode, 'inspect_run_id': run_id, 'inspected_source': base, 'target': target}


def inspection(request):
    """Bind a real successful inspect artifact to the exact unchanged predecessor."""
    run_id = request['inspect_run_id']
    require(request['mode'] == 'release' and re.fullmatch('[1-9][0-9]{0,19}', run_id) is not None,
            'missing inspect evidence')
    run = api('/actions/runs/' + run_id)
    require(run.get('name') == 'G1 Split-Aware Staging Release' and
            run.get('path') == WORKFLOW and run.get('head_branch') == 'feature/staging-preview' and
            run.get('head_sha') == request['inspected_source'] and
            run.get('repository', {}).get('full_name') == REPO and
            run.get('event') in ['push', 'workflow_dispatch'] and run.get('status') == 'completed' and
            run.get('conclusion') == 'success' and
            run.get('actor', {}).get('id') == OWNER_ID and
            run.get('triggering_actor', {}).get('id') == OWNER_ID, 'untrusted prior inspect run')
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))).total_seconds()
    require(0 <= age <= 21600, 'inspect evidence must be within six hours')
    name = 'staging-frontend-journey-release-' + str(run['run_number'])
    artifacts = api('/actions/runs/' + run_id + '/artifacts?per_page=100')
    require(artifacts.get('total_count') == 1 and len(artifacts.get('artifacts', [])) == 1,
            'missing or ambiguous inspect artifact')
    artifact = artifacts['artifacts'][0]
    require(artifact.get('name') == name and artifact.get('expired') is False and
            type(artifact.get('id')) is int and 0 < artifact.get('size_in_bytes', 0) <= 2_000_000,
            'invalid inspect artifact')
    # GitHub CLI handles authenticated archive redirects without exposing credentials.
    archive = subprocess.check_output(['gh', 'api', '/repos/' + REPO + '/actions/artifacts/' +
                                      str(artifact['id']) + '/zip'], stderr=subprocess.PIPE, timeout=60)
    require(len(archive) <= 2_000_000, 'oversized inspect archive')
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        require(package.namelist() == ['release.json'] and
                package.getinfo('release.json').file_size <= 1_000_000, 'unexpected inspect archive')
        saved = json.loads(package.read('release.json'))
    require(saved.get('mode') == 'inspect' and saved.get('decision') == 'PREFLIGHT_PASS' and
            saved.get('source') == request['inspected_source'] and
            saved.get('applicationBaseline') == MERGED and
            saved.get('target', 'frontend') == request.get('target', 'frontend') and all(k in saved for k in SNAPSHOT_FIELDS),
            'artifact is not a successful source-bound inspect')
    return saved


def gates():
    # Both the reviewed application and the exact post-merge preparation HEAD
    # need real staging runs; PR checks can never substitute for either source.
    sha = source()
    for attempt in range(300):
        pending = False
        for checked_sha in dict.fromkeys([MERGED, sha]):
            runs = api('/actions/runs?head_sha=' + checked_sha + '&per_page=100')['workflow_runs']
            for name, path in CHECKS.items():
                matches = [r for r in runs if r['name'] == name and r['head_sha'] == checked_sha
                           and r.get('path') == path and r.get('head_branch') == 'feature/staging-preview'
                           and r.get('event') in ['push', 'workflow_dispatch']]
                if not matches:
                    pending = True
                    continue
                latest = max(matches, key=lambda r: (r['created_at'], r['run_attempt']))
                if latest['status'] != 'completed':
                    pending = True
                    continue
                require(latest['conclusion'] == 'success', 'required check unsuccessful: ' + name)
                if name == 'Hardening CI':
                    jobs = api('/actions/runs/' + str(latest['id']) + '/jobs?per_page=100')['jobs']
                    require(len(jobs) == 5 and {j['name'] for j in jobs} == HARDENING_JOBS and
                            all(j['status'] == 'completed' and j['conclusion'] == 'success' for j in jobs),
                            'Hardening must be 5/5')
                if attempt == 0:
                    print('PASS check', checked_sha, name, latest['html_url'])
        source()  # Close the source-advancement window even when every gate is green.
        if not pending:
            print('PASS: reviewed application and exact release HEAD gates')
            return
        if attempt % 12 == 0:
            print('PENDING: required exact-source checks; no release mutation', flush=True)
        time.sleep(5)
    raise RuntimeError('NO_GO: required exact-source checks timed out')


def service(name):
    return cloud('run', 'services', 'describe', name, '--region', REGION)


def revision(name):
    return cloud('run', 'revisions', 'describe', name, '--region', REGION)


def rows(obj):
    return sorted(obj['status']['traffic'], key=lambda r: (r.get('tag', ''), r['revisionName']))


def serving(obj):
    active = [r for r in rows(obj) if r.get('percent', 0) > 0]
    require(len(active) == 1 and active[0]['percent'] == 100, 'ambiguous serving traffic')
    return active[0]['revisionName']


def tag(obj, name):
    matches = [r for r in rows(obj) if r.get('tag') == name]
    require(len(matches) == 1, 'missing or ambiguous tag ' + name)
    return matches[0]


def env(obj):
    return {x['name']: x for x in obj['spec']['containers'][0].get('env', [])}


def check_router(obj):
    e = env(obj)
    require(all(e.get(k, {}).get('value') == v for k, v in ROUTER.items()), 'exact frontend host/origin contract')


def check_backend(back, admin, user):
    require(serving(back) == ADMIN_REV, 'default backend revision drift')
    a, u = tag(back, 'admin-legacy'), tag(back, 'diewish-test2')
    require((a['revisionName'], a['url']) == (ADMIN_REV, ADMIN), 'Admin tag drift')
    require((u['url'], u.get('percent', 0)) == (USER, 0) and
            u['revisionName'] == user['metadata']['name'], 'Test2 tag drift')
    ae, ue = env(admin), env(user)
    def secret(e, key):
        return e.get(key, {}).get('valueFrom', {}).get('secretKeyRef', {})
    require(secret(ae, 'DATABASE_URL').get('name') == 'diewish-staging-database-url', 'Admin database reference')
    require(secret(ue, 'DATABASE_URL') == {'name': 'diewish-staging-test2-database-url', 'key': '1'}, 'Test2 database reference')
    direct = secret(ue, 'DIRECT_DATABASE_URL')
    require('DIRECT_DATABASE_URL' not in ue or direct == secret(ue, 'DATABASE_URL'), 'Test2 direct database reference')
    for key in ['COACH_SYNC_ENABLED', 'STAGING_AUTOMATION_ENABLED', 'SCHEDULER_TRIGGER_ENABLED', 'NUTRITION_JOBS_ENABLED']:
        require(ue.get(key, {}).get('value') == 'false', 'Test2 background flag ' + key)

    for key in ['ACCOUNT_SAFE_LINKING_ENABLED', 'PHONE_PASSWORD_AUTH_ENABLED', 'PHONE_SMS_RECOVERY_ENABLED']:
        require(ue.get(key, {}).get('value', 'false') == 'false', 'account feature must remain disabled')


def scheduler():
    j = cloud('scheduler', 'jobs', 'describe', 'diewish-notification-dispatch-staging', '--location', REGION)
    require(j.get('state') == 'PAUSED', 'notification scheduler not paused')
    if os.environ.get('RELEASE_TARGET') == 'journey':
        jobs = cloud('scheduler', 'jobs', 'list', '--location', REGION)
        selected = [item for item in jobs if item.get('name', '').rsplit('/', 1)[-1].startswith('diewish')]
        require(selected and all(item.get('state') == 'PAUSED' for item in selected), 'staging scheduler not paused')


def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Diewish-Staging-Release-Verification/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=35) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def health(url):
    code, body = get(url + '/api/health/ready')
    return code, json.loads(body)


def semantic(result):
    code, data = result
    return [code, data.get('success'), data.get('error', {}).get('code'),
            data.get('error', {}).get('details'), data.get('data', {}).get('checks')]


def live():
    normal, direct, admin, legacy = health(APP), health(USER), health(ADMIN_APP), health(ADMIN)
    require(normal[0] == direct[0] == 200 and normal[1].get('data', {}).get('checks', {}).get('database') == 'up', 'Test2 database not ready')
    require(semantic(normal) == semantic(direct), 'normal host differs from Test2 backend')
    require(semantic(admin) == semantic(legacy), 'Admin host differs from legacy backend')
    return {'user': semantic(normal), 'admin': semantic(admin), 'admin_direct': semantic(legacy)}


def fingerprint(obj):
    return hashlib.sha256(json.dumps(obj['spec'], sort_keys=True).encode()).hexdigest()


def info(obj):
    c = obj['spec']['containers'][0]
    safe = {k: v for k, v in env(obj).items() if k in ROUTER or k in ['DATABASE_URL', 'DIRECT_DATABASE_URL', 'DIEWISH_APPLICATION_SHA', 'COACH_SYNC_ENABLED', 'SCHEDULER_TRIGGER_ENABLED', 'NUTRITION_JOBS_ENABLED', 'STAGING_AUTOMATION_ENABLED']}
    for key in ['DATABASE_URL', 'DIRECT_DATABASE_URL']:
        if key in safe:
            safe[key] = {'secretReference': safe[key].get('valueFrom', {}).get('secretKeyRef', 'REDACTED')}
    return {'revision': obj['metadata']['name'], 'image': c['image'],
            'imageDigest': obj['status']['imageDigest'], 'selectedEnvironment': safe,
            'specFingerprint': fingerprint(obj)}


def snapshot():
    source()
    b, f = service(BACK), service(FRONT)
    a, u = revision(ADMIN_REV), revision(tag(b, 'diewish-test2')['revisionName'])
    check_backend(b, a, u)
    old = revision(serving(f))
    check_router(old)
    scheduler()
    return {'source': os.environ['GITHUB_SHA'], 'old_frontend': info(old), 'backendTraffic': rows(b),
            'backendSpecFingerprint': fingerprint(b), 'admin': info(a), 'test2': info(u), 'beforeHealth': live()}


def unchanged(saved, expected_front=None):
    source()
    b, f = service(BACK), service(FRONT)
    expected_rows = saved.get('candidateBackendTraffic', saved['backendTraffic'])
    if saved.get('backendActivated'):
        expected_rows = [{**row, 'revisionName': saved['new_backend']['revision']}
                         if row.get('tag') == 'diewish-test2' else row for row in expected_rows]
    require(rows(b) == sorted(expected_rows, key=lambda row: (row.get('tag', ''), row['revisionName'])) and
            fingerprint(b) == saved.get('candidateBackendSpecFingerprint', saved['backendSpecFingerprint']),
            'concurrent backend change')
    require(serving(f) == (expected_front or saved['old_frontend']['revision']), 'concurrent frontend traffic change')
    scheduler()
    return f


def save(data):
    p = Path(os.environ['RUNNER_TEMP']) / 'frontend-release-evidence'
    p.mkdir(exist_ok=True)
    (p / 'release.json').write_text(json.dumps(data, indent=2, sort_keys=True))


def build(saved):
    sha = source()
    require(saved['source'] == sha, 'snapshot/build source mismatch')
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/diewish-staging/frontend:journey-{sha}'
    substitutions = {'_IMAGE': image, '_GIT_SHA': sha, '_API_BASE_URL': '/api',
                     '_SITE_URL': APP, '_API_PROXY_TARGET': 'https://invalid-legacy-fallback.invalid'}
    result = cloud('builds', 'submit', '--no-source', '--config', '.github/cloudbuild/frontend-staging.yaml',
                   '--substitutions', ','.join(k + '=' + v for k, v in substitutions.items()), '--async')
    require(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', result.get('id', '')) is not None, 'invalid build id')
    saved['buildId'] = result['id']
    save(saved)
    for _ in range(180):
        result = cloud('builds', 'describe', saved['buildId'])
        require(result.get('id') == saved['buildId'] and result.get('projectId') == PROJECT,
                'build identity mismatch')
        require(all(result.get('substitutions', {}).get(k) == v for k, v in substitutions.items()),
                'build source/substitution mismatch')
        if result['status'] == 'SUCCESS':
            images = result.get('results', {}).get('images', [])
            require(len(images) == 1 and images[0].get('name') == image, 'image result mismatch')
            digest = images[0].get('digest', '')
            require(re.fullmatch('sha256:[a-f0-9]{64}', digest) is not None and digest != RETIRED_DIGEST,
                    'retired or invalid image digest')
            require(saved['old_frontend']['imageDigest'].rsplit('@', 1)[-1] != digest, 'old Web image reused')
            source()
            saved.update(newImage=image.rsplit(':', 1)[0] + '@' + digest, applicationSource=sha)
            save(saved)
            return
        require(result['status'] in ['QUEUED', 'WORKING', 'PENDING'], 'frontend image build ' + result['status'])
        time.sleep(5)
    raise RuntimeError('NO_GO: cloud build timed out')


def candidate_tag():
    # Cloud Run rejects combined service + traffic tag names over 46 characters.
    require(len(FRONT) + len(CANDIDATE_TAG) <= 46, 'candidate tag/service name exceeds Cloud Run limit')
    return CANDIDATE_TAG


def diagnose(saved):
    revisions = cloud('run', 'revisions', 'list', '--service', FRONT, '--region', REGION)
    summary = [{'revision': v['metadata']['name'], 'ready': [{k: c.get(k) for k in ['type', 'status', 'reason']} for c in v.get('status', {}).get('conditions', [])],
                'image': v.get('spec', {}).get('containers', [{}])[0].get('image')}
               for v in revisions if v['metadata']['name'].startswith(FRONT + '-')]
    saved['revisionInventory'] = summary
    audit_filter = 'protoPayload.serviceName="run.googleapis.com" AND resource.labels.service_name="' + FRONT + '" AND protoPayload.status.code!=0'
    audit = cloud('logging', 'read', audit_filter, '--freshness=12h', '--limit=10', optional=True)
    saved['auditErrors'] = [{'code': v.get('protoPayload', {}).get('status', {}).get('code'),
                            'message': safe_error(v.get('protoPayload', {}).get('status', {}).get('message', ''))}
                           for v in (audit or [])]
    save(saved)
    print('READ_ONLY_DIAGNOSIS ' + json.dumps({'revisionCount': len(summary), 'auditErrors': saved['auditErrors']}), flush=True)
    saved['decision'] = 'READ_ONLY_DIAGNOSIS_COMPLETE'
    save(saved)


def image_version(saved):
    host = REGION + '-docker.pkg.dev'
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    subprocess.run(['docker', 'login', '-u', 'oauth2accesstoken', '--password-stdin', host],
                   input=token, text=True, capture_output=True, check=True)
    # Pull and inspect the immutable digest, never the mutable image tag.
    subprocess.run(['docker', 'pull', saved['newImage']], capture_output=True, text=True, check=True)
    labels = json.loads(subprocess.check_output(['docker', 'image', 'inspect', saved['newImage'],
                                                '--format', '{{json .Config.Labels}}'], text=True))
    require((labels or {}).get('DIEWISH_APPLICATION_SHA') == saved['source'] == saved['applicationSource'],
            'image source marker mismatch')
    js = r'''const fs=require('fs'), crypto=require('crypto');
    const assets=JSON.parse(process.argv[1]);
    const hashes=Object.fromEntries(assets.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync('public/'+p)).digest('hex')]));
    const markers=['data-journey-plan-meal','data-journey-next','data-journey-progress-area','/tracking/meal-check-ins'];
    const found=new Set();
    function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const p=dir+'/'+e.name;
      if(e.isDirectory())scan(p);else if(p.endsWith('.js')){
        const text=fs.readFileSync(p,'utf8');for(const m of markers)if(text.includes(m))found.add(m);
      }
    }}
    scan('.next/server');scan('.next/static');
    console.log(JSON.stringify({next:require('next/package.json').version,assets:hashes,journey:found.size===markers.length}));'''
    report = json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network=none', '--entrypoint', 'node',
                                                 saved['newImage'], '-e', js, json.dumps(ASSETS)], text=True))
    expected = {asset: hashlib.sha256((Path('frontend/public') / asset).read_bytes()).hexdigest() for asset in ASSETS}
    require(report.get('next') == '15.5.28', 'built image does not contain Next 15.5.28')
    require(report.get('assets') == expected, 'built image asset checksum mismatch')
    require(report.get('journey') is True, 'built image Journey content missing')
    saved.update(verifiedImageNextVersion=report['next'], verifiedImageSource=labels['DIEWISH_APPLICATION_SHA'],
                 verifiedAssetChecksums=expected, verifiedImageJourney=True)
    save(saved)


def browser_smoke():
    # Existing frontend Playwright dependency; no accounts, credentials or form submission.
    js = r'''
    const { chromium } = require('./frontend/node_modules/playwright');
    (async () => {
      const browser = await chromium.launch();
      try {
        for (const theme of ['light', 'dark']) {
          const ctx = await browser.newContext({viewport:{width:390,height:844},colorScheme:theme});
          await ctx.addInitScript(t => localStorage.setItem('theme',t),theme);
          const page = await ctx.newPage();
          const response = await page.goto('https://staging.diewish.com/login');
          if(response.status()!==200) throw new Error('login HTTP');
          await page.waitForFunction(t=>document.documentElement.classList.contains(t),theme);
          await page.getByLabel('E-posta',{exact:true}).waitFor({state:'visible'});
          await page.getByLabel('Şifre',{exact:true}).waitFor({state:'visible'});
          await page.getByRole('button',{name:'Giriş Yap',exact:true}).waitFor({state:'visible'});
          await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-testid="diewish-brand"] img')).filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete&&i.naturalWidth>0));
          await page.screenshot({path:process.env.RUNNER_TEMP+'/frontend-release-evidence/login-'+theme+'.png',fullPage:true});
          await ctx.close();
        }
      } finally { await browser.close(); }
    })().catch(e=>{console.error(e.message);process.exit(1)});
    '''
    subprocess.run(['node', '-e', js], check=True, timeout=120)


def surfaces():
    for host, path in [(APP, '/login'), (ADMIN_APP, '/admin/login')]:
        code, body = get(host + path)
        require(code == 200 and b'<html' in body.lower(), 'login HTML unavailable ' + path)
    for asset in ASSETS:
        code, body = get(APP + '/' + asset)
        expected = Path('frontend/public') / asset
        require(code == 200 and hashlib.sha256(body).digest() == hashlib.sha256(expected.read_bytes()).digest(), 'brand/mascot asset ' + asset)


def release(saved):
    request = activation()
    require(request and request['mode'] == 'release' and os.environ.get('RELEASE_MODE') == 'release',
            'release requires explicit workflow_dispatch or verified marker mode=release')
    prior = inspection(request)
    require(all(saved.get(k) == prior[k] for k in SNAPSHOT_FIELDS), 'runtime changed since prior inspect')
    saved['inspectRunId'] = request['inspect_run_id']
    require(saved['source'] == source(), 'snapshot/release source mismatch')
    gates()
    unchanged(saved)
    if request.get('target') == 'journey':
        prepare_backend(saved)
    build(saved)
    image_version(saved)
    gates()
    unchanged(saved)
    cloud('run', 'deploy', FRONT, '--region', REGION, '--image', saved['newImage'], '--no-traffic',
          '--tag', candidate_tag(), '--update-env-vars',
          ','.join(k + '=' + v for k, v in {**ROUTER, 'DIEWISH_APPLICATION_SHA': saved['source']}.items()))
    f = unchanged(saved)
    candidate = tag(f, candidate_tag())
    require(candidate.get('percent', 0) == 0, 'candidate received default traffic')
    new = revision(candidate['revisionName'])
    check_router(new)
    require(new['status']['imageDigest'] == saved['newImage'], 'candidate digest mismatch')
    # Preserve all prior runtime env, adding only the non-secret source marker.
    old_env = env(revision(saved['old_frontend']['revision']))
    require(env(new) == {**old_env, 'DIEWISH_APPLICATION_SHA': {'name': 'DIEWISH_APPLICATION_SHA', 'value': saved['source']}}, 'unexpected candidate environment change')
    old_spec = copy.deepcopy(revision(saved['old_frontend']['revision'])['spec'])
    new_spec = copy.deepcopy(new['spec'])
    for spec in [old_spec, new_spec]:
        spec['containers'][0].pop('image', None)
        spec['containers'][0].pop('env', None)
    require(old_spec == new_spec, 'unexpected frontend runtime configuration change')
    require(get(candidate['url'] + '/api/health/ready')[0] == 421, 'wrong host did not fail closed')
    saved['new_frontend'] = info(new)
    saved['candidateWrongHostStatus'] = 421
    save(saved)
    # Fresh final preflight directly before traffic, then protected frontend-only swap.
    gates()
    unchanged(saved)
    require(live() == saved['beforeHealth'], 'health drift before cutover')
    saved['decision'] = 'CUTOVER_STARTED'
    save(saved)
    try:
        if request.get('target') == 'journey':
            saved['backendActivated'] = True  # Uncertain API responses must also restore the tag.
            save(saved)
            backend_tag(saved['new_backend']['revision'])
            unchanged(saved)
            require(live() == saved['beforeHealth'], 'backend cutover health drift')
        cloud('run', 'services', 'update-traffic', FRONT, '--region', REGION, '--to-revisions', candidate['revisionName'] + '=100')
        for attempt in range(12):
            try:
                saved['afterHealth'] = live()
                surfaces()
                break
            except (RuntimeError, urllib.error.URLError):
                if attempt == 11:
                    raise
                time.sleep(4)
        browser_smoke()
        if request.get('target') == 'journey':
            journey_acceptance(APP)
        unchanged(saved, candidate['revisionName'])
        saved['decision'] = 'GO'
        saved['rollback'] = 'NOT_NEEDED; restore frontend and, for Journey, previous Test2 tag; retain DB'
        save(saved)
        print('GO: verified staging release; Admin unchanged, DB retained')
    except BaseException:
        saved['decision'] = 'NO_GO'
        # Covers an uncertain response from the first traffic mutation as well.
        save(saved)
        try:
            active = [row for row in rows(service(FRONT)) if row.get('percent', 0) > 0]
            require(active and all(row['revisionName'] in [candidate['revisionName'], saved['old_frontend']['revision']] for row in active),
                    'foreign concurrent frontend release; refusing to overwrite it')
            cloud('run', 'services', 'update-traffic', FRONT, '--region', REGION,
                  '--to-revisions', saved['old_frontend']['revision'] + '=100')
            require(serving(service(FRONT)) == saved['old_frontend']['revision'], 'rollback traffic not restored')
            saved['rollbackHealth'] = live()
            saved['rollback'] = 'RESTORED_AND_HEALTH_VERIFIED'
            save(saved)
        finally:
            if saved.get('backendActivated'):
                rollback_backend(saved)
        raise


def journey_requested():
    request = activation()
    return bool(request and request.get('target') == 'journey' and
                request['mode'] == 'release' and os.environ.get('RELEASE_MODE') == 'release')


def backend_candidate_tag():
    sha = os.environ.get('GITHUB_SHA', '')
    require(re.fullmatch('[a-f0-9]{40}', sha) is not None, 'invalid candidate source')
    return 'g1-' + sha[:12]


def backend_tag(name):
    cloud('run', 'services', 'update-traffic', BACK, '--region', REGION,
          '--update-tags', 'diewish-test2=' + name)


def backend_contract():
    # Reuse the existing build-only guard, including all six required substitutions.
    import importlib.util
    spec = importlib.util.spec_from_file_location('g1_build_inputs', 'scripts/test2-security-build-context.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    require(module.G1_SOURCE == MERGED, 'release/build application baseline mismatch')
    require(module.G1_APPROVED_SOURCE == APPROVED_SOURCE, 'release/build approved source mismatch')
    return module


def build_backend(saved):
    sha, contract = source(), backend_contract()
    require(saved['source'] == sha, 'backend snapshot/source mismatch')
    image = contract.IMAGE_PREFIX + sha
    substitutions = {'_IMAGE': image, '_GIT_SHA': sha, '_SOURCE_HARNESS_SHA': contract.G1_APPROVED_SOURCE,
                     '_SOURCE_MANIFEST_SHA256': contract.G1_APPROVED_MANIFEST,
                     '_BACKEND_TREE': contract.G1_APPROVED_BACKEND, '_LOCK_SHA256': contract.G1_APPROVED_LOCK}
    contract.inputs(sha, contract.G1_APPROVED_SOURCE, contract.G1_APPROVED_MANIFEST,
                    contract.G1_APPROVED_BACKEND, contract.G1_APPROVED_LOCK, image)
    built = cloud('builds', 'submit', '--no-source', '--config', contract.DEFINITION,
                  '--substitutions', ','.join(k + '=' + v for k, v in substitutions.items()), '--async')
    identifier = built.get('id', '')
    require(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', identifier), 'invalid backend build id')
    saved['backendBuildId'] = identifier
    save(saved)
    for _ in range(180):
        result = cloud('builds', 'describe', identifier)
        require(result.get('id') == identifier and result.get('projectId') == PROJECT
                and all(result.get('substitutions', {}).get(k) == v for k, v in substitutions.items()),
                'backend build identity/source inputs mismatch')
        if result['status'] == 'SUCCESS':
            images = result.get('results', {}).get('images', [])
            require(len(images) == 1 and images[0].get('name') == image and
                    re.fullmatch('sha256:[a-f0-9]{64}', images[0].get('digest', '')), 'backend build digest mismatch')
            source()
            saved['newBackendImage'] = image.rsplit(':', 1)[0] + '@' + images[0]['digest']
            require(saved['newBackendImage'] != saved['test2']['imageDigest'], 'old backend image reused')
            save(saved)
            return
        require(result['status'] in ['PENDING', 'QUEUED', 'WORKING'], 'backend build failed')
        time.sleep(5)
    raise RuntimeError('NO_GO: backend build timed out')


def backend_image_version(saved):
    contract = backend_contract()
    image = saved['newBackendImage']
    # image_version already authenticates Docker without printing its token.
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    subprocess.run(['docker', 'login', '-u', 'oauth2accesstoken', '--password-stdin', REGION + '-docker.pkg.dev'],
                   input=token, text=True, capture_output=True, check=True)
    subprocess.run(['docker', 'pull', image], capture_output=True, text=True, check=True)
    labels = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image,
                                                '--format', '{{json .Config.Labels}}'], text=True))
    expected = {'io.diewish.source-kind': 'composed', 'io.diewish.build-definition-sha': saved['source'],
                'io.diewish.source-harness-sha': contract.G1_APPROVED_SOURCE,
                'io.diewish.source-manifest-sha256': contract.G1_APPROVED_MANIFEST,
                'io.diewish.backend-tree': contract.G1_APPROVED_BACKEND,
                'io.diewish.lock-sha256': contract.G1_APPROVED_LOCK}
    require(all((labels or {}).get(k) == v for k, v in expected.items()), 'backend image provenance mismatch')
    js = """const fs=require('fs'),c=require('crypto');
    console.log(JSON.stringify({qs:require('qs/package.json').version,
    minimatch:require('minimatch-engine/package.json').version,
    states:Object.keys(require('@prisma/client').MealCheckInState).sort(),
    checkIn:fs.readFileSync('dist/modules/tracking/meal-check-in.controller.js','utf8').includes('MEAL_CHECK_IN_NOT_READY')}));"""
    report = json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network=none', '--entrypoint', 'node',
                                                 image, '-e', js], text=True))
    require(report == {'qs': '6.16.1', 'minimatch': '11.0.1',
                       'states': ['EATEN', 'PENDING', 'SKIPPED'], 'checkIn': True},
            'backend compiled content/Prisma mismatch')
    saved['backendImageVerified'] = True
    save(saved)


def same_runtime(old, new, image, sha):
    expected = copy.deepcopy(old['spec'])
    expected['containers'][0]['image'] = new['spec']['containers'][0]['image']
    e = env(old)
    e['DIEWISH_APPLICATION_SHA'] = {'name': 'DIEWISH_APPLICATION_SHA', 'value': sha}
    actual = copy.deepcopy(new['spec'])
    expected['containers'][0]['env'] = sorted(e.values(), key=lambda x: x['name'])
    actual['containers'][0]['env'] = sorted(env(new).values(), key=lambda x: x['name'])
    require(expected == actual and new['status']['imageDigest'] == image, 'backend candidate runtime drift')
    for key in ['run.googleapis.com/vpc-access-connector', 'run.googleapis.com/vpc-access-egress',
                'run.googleapis.com/cloudsql-instances', 'run.googleapis.com/execution-environment']:
        require(old.get('metadata', {}).get('annotations', {}).get(key) ==
                new.get('metadata', {}).get('annotations', {}).get(key), 'backend network/runtime annotation drift')


def journey_acceptance(base):
    # The child has a dedicated Test2 URL only; it cannot use a fallback DATABASE_URL.
    result = subprocess.run(['node', 'scripts/journey-live-acceptance.cjs', base],
                            capture_output=True, text=True, timeout=180, check=False)
    require(result.returncode == 0 and result.stdout.strip() == 'PASS: G1 synthetic API persistence',
            'G1 live acceptance failed; credentials/response bodies withheld')


def prepare_backend(saved):
    require(journey_requested(), 'explicit Journey release required')
    require(all(row.get('tag') != backend_candidate_tag() for row in rows(service(BACK))),
            'candidate tag already exists; do not repeat the build')
    build_backend(saved)
    backend_image_version(saved)
    gates()
    unchanged(saved)
    before = service(BACK)
    tag_name = backend_candidate_tag()
    require(all(row.get('tag') != tag_name for row in rows(before)), 'candidate tag already exists; do not retry')
    old = revision(saved['test2']['revision'])
    check_backend(before, revision(ADMIN_REV), old)
    require(old['spec']['containers'][0].get('command') == ['npm'] and
            old['spec']['containers'][0].get('args') == ['start'], 'backend startup must be migration-free')
    values, secrets = {}, []
    for name, value in env(old).items():
        if 'value' in value:
            values[name] = value['value']
        else:
            ref = value.get('valueFrom', {}).get('secretKeyRef', {})
            require(set(ref) == {'name', 'key'}, 'unsupported secret reference')
            secrets.append(name + '=' + ref['name'] + ':' + ref['key'])
    values['DIEWISH_APPLICATION_SHA'] = saved['source']
    require(old['spec'].get('serviceAccountName') == 'diewish-staging-runtime@' + PROJECT + '.iam.gserviceaccount.com',
            'unexpected backend runtime identity')
    with tempfile.TemporaryDirectory() as directory:
        config = Path(directory) / 'env.json'
        config.write_text(json.dumps(values))
        config.chmod(0o600)
        args = ['run', 'deploy', BACK, '--region', REGION, '--image', saved['newBackendImage'],
                '--no-traffic', '--tag', tag_name, '--command=npm', '--args=start',
                '--env-vars-file', str(config), '--set-secrets', ','.join(sorted(secrets)),
                '--service-account', old['spec']['serviceAccountName']]
        for field, flag in [('containerConcurrency', '--concurrency'), ('timeoutSeconds', '--timeout')]:
            if field in old['spec']:
                args += [flag, str(old['spec'][field])]
        for field in ['cpu', 'memory']:
            value = old['spec']['containers'][0].get('resources', {}).get('limits', {}).get(field)
            if value:
                args += ['--' + field, str(value)]
        cloud(*args)
    after = service(BACK)
    candidate = tag(after, tag_name)
    expected_rows = sorted(saved['backendTraffic'] + [candidate], key=lambda row: (row.get('tag', ''), row['revisionName']))
    require(rows(after) == expected_rows and candidate.get('percent', 0) == 0,
            'backend candidate changed existing routing')
    new = revision(candidate['revisionName'])
    same_runtime(old, new, saved['newBackendImage'], saved['source'])
    require(candidate['url'] == 'https://' + tag_name + '---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app',
            'wrong backend candidate host')
    saved.update(candidateBackendTraffic=rows(after), candidateBackendSpecFingerprint=fingerprint(after),
                 new_backend=info(new), backendCandidateUrl=candidate['url'])
    save(saved)
    unchanged(saved)
    journey_acceptance(candidate['url'])
    saved['backendAcceptanceVerified'] = True
    save(saved)


def rollback_backend(saved):
    back = service(BACK)
    # Refuse foreign Admin/other tag/default changes, even during rollback.
    check_backend(back, revision(ADMIN_REV), revision(tag(back, 'diewish-test2')['revisionName']))
    allowed = {saved['test2']['revision'], saved['new_backend']['revision']}
    require(tag(back, 'diewish-test2')['revisionName'] in allowed, 'foreign backend release; do not overwrite')
    other = lambda rows_: [x for x in rows_ if x.get('tag') != 'diewish-test2']
    require(other(rows(back)) == other(saved['candidateBackendTraffic']) and
            fingerprint(back) == saved['candidateBackendSpecFingerprint'], 'foreign backend drift during rollback')
    backend_tag(saved['test2']['revision'])
    saved['backendActivated'] = False
    unchanged(saved)
    saved['rollbackHealth'] = live()
    saved['rollback'] = 'FRONTEND_AND_TEST2_RESTORED_DB_RETAINED'
    save(saved)


def main(mode):
    request = activation()
    if mode == 'authorize' and request is None:
        print('OFFLINE_ONLY: no intentional staging frontend activation')
        return
    require(request is not None, 'unverified staging frontend entrypoint')
    require(mode == 'authorize' or request['mode'] == ('inspect' if mode == 'diagnose' else mode),
            'unverified staging frontend mode')
    source()
    if mode == 'authorize':
        if request['mode'] == 'release':
            inspection(request)  # Refuse missing/forged evidence before obtaining cloud identity.
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('mode=' + request['mode'] + '\n')
            output.write('target=' + request.get('target', 'frontend') + '\n')
        return
    if mode == 'release':
        inspection(request)  # Prior inspect is mandatory even before a fresh cloud snapshot.
    snapshot_data = snapshot()
    snapshot_data['decision'] = 'PREFLIGHT_PASS'
    snapshot_data['mode'] = mode
    snapshot_data['target'] = request.get('target', 'frontend')
    snapshot_data['applicationBaseline'] = MERGED
    save(snapshot_data)
    print('PASS: fresh read-only split preflight; actual serving frontend', snapshot_data['old_frontend']['revision'])
    if mode == 'release':
        release(snapshot_data)
    elif mode == 'diagnose':
        diagnose(snapshot_data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['authorize', 'inspect', 'diagnose', 'release'])
    main(parser.parse_args().mode)
