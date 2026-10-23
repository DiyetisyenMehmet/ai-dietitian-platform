"""Frontend-only release under #98. Never mutate a backend, database, secret or IAM.

Replaces the historical fixed-revision Auth A2 orchestration. Inspect is read-only;
release captures the real serving revision and rolls only frontend traffic back.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request

PROJECT = 'project-a2e260c1-839d-4f1d-b90'
REGION = 'europe-west1'
REPO = 'DiyetisyenMehmet/ai-dietitian-platform'
MERGED = 'bd42cfd465730a1e7d8678d0bb73bfe76939a32f'
IMAGE_SOURCE = '1d809cfc164551e940c81a41af8fbfd7eb3d4cce'
REUSED_BUILD = '43cd0b6a-e9d8-49d9-a531-b0584fca7596'
REUSED_DIGEST = 'sha256:b2de3f9d240cc1adf41e211f974c0b636c7a0bd52fae545e821ebc5b232692d7'
BACK = 'diewish-backend-staging'
FRONT = 'diewish-frontend-staging'
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
              '.github/workflows/staging-notification-test-apk.yml',
              'scripts/staging-frontend-release.py',
              'scripts/staging-frontend-release.test.py'}
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
        (r'INVALID_ARGUMENT|unrecognized arguments|Invalid value|must be', 'INVALID_ARGUMENT'),
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
        require(args[2] == FRONT and '--no-traffic' in args, 'unsafe deploy target')
    elif args[:3] == ('run', 'services', 'update-traffic'):
        require(args[3] == FRONT, 'unsafe traffic target')
    else:
        require(args[:3] in [('run', 'services', 'describe'), ('run', 'revisions', 'describe'),
                            ('run', 'revisions', 'list'), ('scheduler', 'jobs', 'describe'), ('builds', 'submit', '--no-source')]
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
    sha = os.environ['GITHUB_SHA']
    require(re.fullmatch('[a-f0-9]{40}', sha) is not None, 'invalid source SHA')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/feature/staging-preview', 'wrong ref')
    require(api('/git/ref/heads/feature/staging-preview')['object']['sha'] == sha, 'staging advanced')
    subprocess.run(['git', 'merge-base', '--is-ancestor', MERGED, sha], check=True)
    changed = subprocess.check_output(['git', 'diff', '--name-only', MERGED, sha], text=True).splitlines()
    require(set(changed) <= PREP_FILES, 'application drift since reviewed PR97 merge')
    pkg = json.loads(Path('frontend/package.json').read_text())
    lock = json.loads(Path('frontend/package-lock.json').read_text())
    require(pkg['dependencies']['next'] == '15.5.28' and
            lock['packages']['node_modules/next']['version'] == '15.5.28', 'Next version mismatch')
    require(Path('.github/staging-test2-split-active').is_file(), 'split sentinel missing')
    return sha


def gates():
    # The merged application's 5/5 gate is mandatory. Preparation-only source
    # equality above lets unchanged platform tests retain their original evidence.
    for attempt in range(300):
        pending = False
        for sha, names in [(MERGED, ['Hardening CI', 'Staging Config CI', 'Notification preferences platform checks']),
                           (IMAGE_SOURCE, ['Hardening CI', 'Staging Config CI'])]:
            runs = api('/actions/runs?head_sha=' + sha + '&per_page=100')['workflow_runs']
            for name in names:
                matches = [r for r in runs if r['name'] == name and r['head_sha'] == sha]
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
                    require(len(jobs) == 5 and all(j['conclusion'] == 'success' for j in jobs), 'Hardening must be 5/5')
                if attempt == 0:
                    print('PASS check', sha, name, latest['html_url'])
        if not pending:
            print('PASS: merged 5/5 and exact release-source gates')
            return
        source()
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
    require((u['revisionName'], u['url'], u.get('percent', 0)) == (USER_REV, USER, 0), 'Test2 tag drift')
    ae, ue = env(admin), env(user)
    def secret(e, key):
        return e.get(key, {}).get('valueFrom', {}).get('secretKeyRef', {})
    require(secret(ae, 'DATABASE_URL').get('name') == 'diewish-staging-database-url', 'Admin database reference')
    require(secret(ue, 'DATABASE_URL') == {'name': 'diewish-staging-test2-database-url', 'key': '1'}, 'Test2 database reference')
    direct = secret(ue, 'DIRECT_DATABASE_URL')
    require('DIRECT_DATABASE_URL' not in ue or direct == secret(ue, 'DATABASE_URL'), 'Test2 direct database reference')
    for key in ['COACH_SYNC_ENABLED', 'STAGING_AUTOMATION_ENABLED', 'SCHEDULER_TRIGGER_ENABLED', 'NUTRITION_JOBS_ENABLED']:
        require(ue.get(key, {}).get('value') == 'false', 'Test2 background flag ' + key)


def scheduler():
    j = cloud('scheduler', 'jobs', 'describe', 'diewish-notification-dispatch-staging', '--location', REGION)
    require(j.get('state') == 'PAUSED', 'notification scheduler not paused')


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
    a, u = revision(ADMIN_REV), revision(USER_REV)
    check_backend(b, a, u)
    old = revision(serving(f))
    check_router(old)
    scheduler()
    return {'source': os.environ['GITHUB_SHA'], 'old_frontend': info(old), 'backendTraffic': rows(b),
            'backendSpecFingerprint': fingerprint(b), 'admin': info(a), 'test2': info(u), 'beforeHealth': live()}


def unchanged(saved, expected_front=None):
    source()
    b, f = service(BACK), service(FRONT)
    require(rows(b) == saved['backendTraffic'] and fingerprint(b) == saved['backendSpecFingerprint'], 'concurrent backend change')
    require(serving(f) == (expected_front or saved['old_frontend']['revision']), 'concurrent frontend traffic change')
    scheduler()
    return f


def save(data):
    p = Path(os.environ['RUNNER_TEMP']) / 'frontend-release-evidence'
    p.mkdir(exist_ok=True)
    (p / 'release.json').write_text(json.dumps(data, indent=2, sort_keys=True))


def build(saved):
    sha = saved['source']
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/diewish-staging/frontend:next-security-{sha}'
    result = cloud('builds', 'submit', '--no-source', '--config', '.github/cloudbuild/frontend-staging.yaml',
                   '--substitutions', f'_IMAGE={image},_GIT_SHA={sha},_API_BASE_URL=/api,_SITE_URL={APP},_API_PROXY_TARGET=https://invalid-legacy-fallback.invalid', '--async')
    saved['buildId'] = result['id']
    save(saved)
    for _ in range(180):
        result = cloud('builds', 'describe', saved['buildId'])
        if result['status'] == 'SUCCESS':
            built = result['results']['images'][0]
            require(built['name'] == image and re.fullmatch('sha256:[a-f0-9]{64}', built['digest']), 'image result mismatch')
            saved['newImage'] = image.rsplit(':', 1)[0] + '@' + built['digest']
            save(saved)
            return
        require(result['status'] in ['QUEUED', 'WORKING', 'PENDING'], 'frontend image build ' + result['status'])
        time.sleep(5)
    raise RuntimeError('NO_GO: cloud build timed out')


def reuse_image(saved):
    built = cloud('builds', 'describe', REUSED_BUILD)
    require(built['status'] == 'SUCCESS' and built['substitutions']['_GIT_SHA'] == IMAGE_SOURCE,
            'prior immutable build/source not reusable')
    expected_name = f'{REGION}-docker.pkg.dev/{PROJECT}/diewish-staging/frontend:next-security-{IMAGE_SOURCE}'
    images = built['results']['images']
    require(any(i['name'] == expected_name and i['digest'] == REUSED_DIGEST for i in images), 'prior immutable image digest mismatch')
    saved.update(newImage=expected_name.rsplit(':', 1)[0] + '@' + REUSED_DIGEST,
                 buildId=REUSED_BUILD, applicationSource=IMAGE_SOURCE,
                 verifiedImageNextVersion='15.5.28',
                 reusedVersionEvidence='https://github.com/' + REPO + '/actions/runs/39917194478/artifacts/12486127055')
    save(saved)
    print('PASS: existing immutable Next 15.5.28 image reused; no build or prior test rerun', flush=True)


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
    gates()
    reuse_image(saved)
    unchanged(saved)
    # One targeted retry only, never a traffic change in diagnosis mode.
    cloud('run', 'deploy', FRONT, '--region', REGION, '--image', saved['newImage'], '--no-traffic',
          '--tag', 'next-security-candidate', '--update-env-vars',
          ','.join(k + '=' + v for k, v in {**ROUTER, 'DIEWISH_APPLICATION_SHA': IMAGE_SOURCE}.items()))
    f = unchanged(saved)
    candidate = tag(f, 'next-security-candidate')
    require(candidate.get('percent', 0) == 0, 'diagnostic candidate received traffic')
    saved['diagnosticCandidate'] = candidate['revisionName']
    saved['decision'] = 'NO_TRAFFIC_CANDIDATE_CREATED_PENDING_REVIEW'
    save(saved)


def image_version(saved):
    host = REGION + '-docker.pkg.dev'
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    subprocess.run(['docker', 'login', '-u', 'oauth2accesstoken', '--password-stdin', host],
                   input=token, text=True, capture_output=True, check=True)
    version = subprocess.check_output(['docker', 'run', '--rm', '--entrypoint', 'node', saved['newImage'],
                                       '-p', "require('next/package.json').version"], text=True).strip()
    require(version == '15.5.28', 'built image does not contain Next 15.5.28')
    saved['verifiedImageNextVersion'] = version
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
    gates()
    reuse_image(saved)
    unchanged(saved)
    cloud('run', 'deploy', FRONT, '--region', REGION, '--image', saved['newImage'], '--no-traffic',
          '--tag', 'next-security-candidate', '--update-env-vars',
          ','.join(k + '=' + v for k, v in {**ROUTER, 'DIEWISH_APPLICATION_SHA': IMAGE_SOURCE}.items()))
    f = unchanged(saved)
    candidate = tag(f, 'next-security-candidate')
    require(candidate.get('percent', 0) == 0, 'candidate received default traffic')
    new = revision(candidate['revisionName'])
    check_router(new)
    require(new['status']['imageDigest'] == saved['newImage'], 'candidate digest mismatch')
    # Preserve all prior runtime env, adding only the non-secret source marker.
    old_env = env(revision(saved['old_frontend']['revision']))
    require(env(new) == {**old_env, 'DIEWISH_APPLICATION_SHA': {'name': 'DIEWISH_APPLICATION_SHA', 'value': IMAGE_SOURCE}}, 'unexpected candidate environment change')
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
    unchanged(saved)
    require(live() == saved['beforeHealth'], 'health drift before cutover')
    saved['decision'] = 'CUTOVER_STARTED'
    save(saved)
    try:
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
        unchanged(saved, candidate['revisionName'])
        saved['decision'] = 'GO'
        saved['rollback'] = 'NOT_NEEDED; restore only frontend to ' + saved['old_frontend']['revision']
        save(saved)
        print('GO: frontend-only release verified; backend traffic/spec unchanged')
    except BaseException:
        saved['decision'] = 'NO_GO'
        # Covers an uncertain response from the first traffic mutation as well.
        current = serving(service(FRONT))
        require(current in [candidate['revisionName'], saved['old_frontend']['revision']],
                'foreign concurrent frontend release; refusing to overwrite it')
        cloud('run', 'services', 'update-traffic', FRONT, '--region', REGION,
              '--to-revisions', saved['old_frontend']['revision'] + '=100')
        require(serving(service(FRONT)) == saved['old_frontend']['revision'], 'rollback traffic not restored')
        saved['rollbackHealth'] = live()
        saved['rollback'] = 'RESTORED_AND_HEALTH_VERIFIED'
        save(saved)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['inspect', 'diagnose', 'release'])
    args = parser.parse_args()
    snapshot_data = snapshot()
    snapshot_data['decision'] = 'PREFLIGHT_PASS'
    save(snapshot_data)
    print('PASS: fresh read-only split preflight; actual serving frontend', snapshot_data['old_frontend']['revision'])
    if args.mode == 'release':
        release(snapshot_data)
    elif args.mode == 'diagnose':
        diagnose(snapshot_data)
