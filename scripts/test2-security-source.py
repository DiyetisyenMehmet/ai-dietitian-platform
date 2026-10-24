"""G1 offline source composition. No Docker, cloud, database or deployment calls."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile

BASE = '09a069f3271d60716efd997ad86bb05018e4d0d9'
REVIEWED = '7a437ca4c04f61d39696c467738fa01a2e127616'
PINS = {
    'backend/package.json': '7066ba6025144e41c256faa752a9e8f0005e13f4',
    'backend/package-lock.json': 'b55c80839af1027458090f0f39532a31bea17623',
    'backend/src/middleware/validate.ts': '4f223d594c2274ccb07695c632aab546995aff6e',
    'backend/src/middleware/error-handler.ts': '94ec359e1d742d15806efd589678cf22e50e6658',
    'backend/src/middleware/zod-security.test.ts': 'd36e45e274148583d7dc152feecad603db286dcc',
    'backend/tests/body-parser-security.test.mjs': '4dbac384b7f668ab0e70ee6ba3d468e3aa478aed',
    'backend/src/middleware/upload-security.test.ts': '00a929527bca9553de4615cc6ec0a1dc8a593639',
    'backend/src/lib/mailer.test.ts': '8fe44ec01b2975d9c34819d972d565a4b63b8ec9',
}
HARNESS_FILES = frozenset(['.github/workflows/test2-security-source-checks.yml', 'scripts/test2-security-runtime.test.cjs', 'scripts/test2-security-source.py', 'scripts/test2-security-source.test.py'])
SOURCE_POLICY_SHA256 = '22d0ceca5f0a7265903ba0db4a8cfe1ac76d473449cdf999ea7c4d2df9b897d4'
VERSIONS = {'zod': '4.6.6', 'body-parser': '1.20.9', 'multer': '2.5.0', 'nodemailer': '10.1.4'}


def require(condition, message):
    if not condition:
        raise RuntimeError('NO_GO: ' + message)


def git(repo, *args, env=None):
    result = subprocess.run(['git', '-C', str(repo), *args], env=env,
                            capture_output=True, check=False)
    require(result.returncode == 0, 'Git object unavailable or command rejected: ' + args[0])
    return result.stdout


def text(repo, *args, env=None):
    return git(repo, *args, env=env).decode().strip()


def validated_harness(repo, harness_ref=None):
    # An immutable approved reference is an explicit input, never inferred from HEAD.
    harness_ref = harness_ref if harness_ref is not None else os.environ.get('G1_TEST_HARNESS_REF', '')
    require(isinstance(harness_ref, str) and re.fullmatch(r'[0-9a-f]{40}', harness_ref),
            'explicit immutable test harness commit required')
    require(text(repo, 'rev-parse', '--verify', harness_ref + '^{commit}') == harness_ref,
            'test harness commit mismatch')
    git(repo, 'merge-base', '--is-ancestor', REVIEWED, harness_ref)
    inventory = {}
    for path in sorted(HARNESS_FILES):
        expected = text(repo, 'ls-tree', harness_ref, '--', path)
        require(expected.startswith('100644 blob '), 'missing or unsafe harness entry: ' + path)
        require(text(repo, 'ls-tree', 'HEAD', '--', path) == expected,
                'test harness content drift: ' + path)
        data = git(repo, 'show', harness_ref + ':' + path)
        actual = Path(repo) / path
        require(actual.is_file() and not actual.is_symlink() and actual.read_bytes() == data
                and not actual.stat().st_mode & 0o111, 'test harness worktree drift: ' + path)
        if path == 'scripts/test2-security-source.py':
            require(Path(__file__).read_bytes() == data, 'running composer differs from trusted harness')
        inventory[path] = {'blob': expected.split()[2], 'sha256': hashlib.sha256(data).hexdigest()}
    return harness_ref, inventory


def source_objects(repo, harness_ref=None):
    policy = {'base': BASE, 'security': REVIEWED, 'blobs': PINS, 'versions': VERSIONS,
              'harnessFiles': sorted(HARNESS_FILES)}
    policy_hash = hashlib.sha256(json.dumps(policy, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    require(policy_hash == SOURCE_POLICY_SHA256, 'source policy mismatch')
    for sha in (BASE, REVIEWED):
        require(text(repo, 'rev-parse', '--verify', sha + '^{commit}') == sha, 'pinned commit mismatch')
    git(repo, 'merge-base', '--is-ancestor', BASE, REVIEWED)
    head = text(repo, 'rev-parse', 'HEAD')
    git(repo, 'merge-base', '--is-ancestor', REVIEWED, head)
    harness_ref, harness_files = validated_harness(repo, harness_ref)
    for path, oid in PINS.items():
        require(text(repo, 'rev-parse', REVIEWED + ':' + path) == oid, 'reviewed blob mismatch: ' + path)
    before = json.loads(git(repo, 'show', BASE + ':backend/package.json'))
    after = json.loads(git(repo, 'show', REVIEWED + ':backend/package.json'))
    expected = json.loads(json.dumps(before))
    for name in ('zod', 'multer', 'nodemailer'):
        expected['dependencies'][name] = VERSIONS[name]
    prefix = 'node --import tsx --test '
    require(expected['scripts']['test'].startswith(prefix), 'unrecognized base test command')
    expected['scripts']['test'] = prefix + 'src/middleware/zod-security.test.ts ' + expected['scripts']['test'][len(prefix):]
    require(expected == after, 'unexpected dependency manifest delta')
    old_lock = json.loads(git(repo, 'show', BASE + ':backend/package-lock.json'))
    lock = json.loads(git(repo, 'show', REVIEWED + ':backend/package-lock.json'))
    for key in ('dependencies', 'devDependencies'):
        require(after.get(key, {}) == lock['packages'][''].get(key, {}), 'manifest/lock mismatch')
    delta = {k for k in old_lock['packages'].keys() | lock['packages'].keys()
             if old_lock['packages'].get(k) != lock['packages'].get(k)}
    require(delta == {''} | {'node_modules/' + k for k in VERSIONS}, 'unrelated locked package drift')
    for name, version in VERSIONS.items():
        require(lock['packages']['node_modules/' + name]['version'] == version, 'wrong security version')
    with tempfile.TemporaryDirectory(prefix='g1-source-index-') as temp:
        env = {**os.environ, 'GIT_INDEX_FILE': str(Path(temp) / 'index')}
        git(repo, 'read-tree', BASE, env=env)
        for path, oid in PINS.items():
            git(repo, 'update-index', '--add', '--cacheinfo', f'100644,{oid},{path}', env=env)
        tree = text(repo, 'write-tree', env=env)
    require(set(text(repo, 'diff', '--name-only', BASE, tree).splitlines()) == set(PINS), 'non-allowlisted source delta')
    raw = git(repo, 'archive', '--format=tar', tree, 'backend')
    files = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for item in archive:
            path = PurePosixPath(item.name)
            require(not path.is_absolute() and '..' not in path.parts and path.parts[0] == 'backend', 'unsafe source path')
            if item.isdir():
                continue
            require(item.isfile(), 'symlink or special source entry')
            data = archive.extractfile(item).read()
            files[item.name] = (data, 0o755 if item.mode & 0o111 else 0o644)
    listed = {}
    for record in git(repo, 'ls-tree', '-r', '-z', tree, 'backend').split(b'\0'):
        if not record:
            continue
        metadata, path = record.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        require(kind == 'blob' and mode in ('100644', '100755'), 'unsupported Git source entry')
        listed[path.decode()] = (oid, 0o755 if mode == '100755' else 0o644)
    require(set(files) == set(listed), 'archive omitted or added Git source files')
    for path, (data, mode) in files.items():
        oid = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        require((oid, mode) == listed[path], 'archive differs from exact Git blob/mode')
    inventory = {p: {'sha256': hashlib.sha256(data).hexdigest(), 'mode': oct(mode)}
                 for p, (data, mode) in sorted(files.items())}
    excluded = sorted(set(text(repo, 'diff', '--name-only', BASE, REVIEWED, '--', 'backend').splitlines()) - set(PINS))
    manifest = {'format': 2, 'purpose': 'OFFLINE_SOURCE_ONLY_NOT_AN_IMAGE',
                'baseCommit': BASE, 'securityCommit': REVIEWED, 'testHarnessCommit': harness_ref,
                'testHarnessFiles': harness_files, 'sourcePolicySha256': policy_hash,
                'sourceTree': tree, 'backendTree': text(repo, 'rev-parse', tree + ':backend'),
                'basePrismaTree': text(repo, 'rev-parse', BASE + ':backend/prisma'),
                'versions': VERSIONS, 'allowedBlobs': PINS, 'excludedChanges': excluded,
                'files': inventory}
    return manifest, files


def encoded(manifest):
    return (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()


def prepare(repo, output, harness_ref=None):
    repo, output = Path(repo).resolve(), Path(output).absolute()
    require(not output.exists() and not output.is_symlink(), 'output already exists')
    output = output.resolve()
    require(not output.is_relative_to(repo) and not repo.is_relative_to(output), 'output must be outside repository')
    manifest, files = source_objects(repo, harness_ref)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='g1-compose-', dir=output.parent) as temp:
        root = Path(temp) / 'source'
        root.mkdir()
        for path, (data, mode) in files.items():
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(mode)
        (root / 'source-manifest.json').write_bytes(encoded(manifest))
        root.rename(output)
    verify(repo, output, harness_ref=harness_ref)
    return manifest


def verify(repo, source, installed=False, harness_ref=None):
    expected, _ = source_objects(repo, harness_ref)
    source = Path(source).absolute()
    require(not source.is_symlink(), 'source root symlink')
    source = source.resolve()
    require(not (source / 'source-manifest.json').is_symlink(), 'manifest symlink')
    require((source / 'source-manifest.json').read_bytes() == encoded(expected), 'manifest/provenance mismatch')
    actual = {}
    for root, dirs, names in os.walk(source, followlinks=False):
        parent = Path(root)
        if installed and parent == source / 'backend':
            dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist')]
        for name in dirs:
            require(not (parent / name).is_symlink(), 'source directory symlink')
        for name in names:
            path = parent / name
            relative = path.relative_to(source).as_posix()
            if relative == 'source-manifest.json' or (installed and relative == 'backend/tsconfig.tsbuildinfo'):
                continue
            require(path.is_file() and not path.is_symlink(), 'source file symlink/special entry')
            mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
            actual[relative] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'mode': oct(mode)}
    require(actual == expected['files'], 'source content/mode/inventory mismatch')
    return expected


def validate_ci_database(url):
    require(url == 'postgresql://diewish:diewish@127.0.0.1:5432/g1_test2_source?schema=public',
            'only disposable CI database allowed')


def validate_future_start(command, tag, used_tags):
    # Pure offline contract; this function cannot authorize or perform a release.
    require(command == ['npm', 'start'], 'migration/shell/default startup forbidden')
    require(isinstance(tag, str) and re.fullmatch(r'[a-z](?:[a-z0-9-]*[a-z0-9])?', tag), 'invalid candidate tag')
    require(tag not in {'diewish-test2', 'admin-legacy'} | set(used_tags), 'live/existing tag forbidden')
    require(len('diewish-backend-staging') + len(tag) <= 46, 'candidate tag too long')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'verify', 'guard-ci-db'])
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--source', type=Path)
    parser.add_argument('--harness-ref', help='Approved full commit SHA; or G1_TEST_HARNESS_REF')
    parser.add_argument('--installed', action='store_true')
    args = parser.parse_args()
    if args.mode == 'guard-ci-db':
        validate_ci_database(os.environ.get('DATABASE_URL', ''))
        print('PASS: disposable loopback CI database contract')
        return
    require(args.source is not None, 'source output required')
    manifest = prepare(args.repo, args.source, args.harness_ref) if args.mode == 'prepare' else verify(args.repo, args.source, args.installed, args.harness_ref)
    print(json.dumps({'result': 'PASS', 'purpose': manifest['purpose'], 'baseCommit': BASE,
                      'securityCommit': REVIEWED, 'testHarnessCommit': manifest['testHarnessCommit'],
                      'sourceTree': manifest['sourceTree'], 'backendTree': manifest['backendTree'],
                      'executionCommit': text(args.repo, 'rev-parse', 'HEAD'),
                      'sourcePolicySha256': manifest['sourcePolicySha256'],
                      'manifestSha256': hashlib.sha256(encoded(manifest)).hexdigest(),
                      'lockSha256': manifest['files']['backend/package-lock.json']['sha256']}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, tarfile.TarError) as error:
        raise SystemExit('NO_GO: offline preparation failed: ' + str(error))
