"""Offline input contract for the existing Test2 build-only definition. Never builds an image."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import types

HARNESS = '32552327e2d008db5234cfebc3a8c0da9f578e40'
MANIFEST = '7679ceb6f463d439a0626bcbd8ddb2a505b45b8b5ea3218a7c10e769f63bdf7d'
BACKEND = '35f9f5b81cf3dd3903e7286e24bf296da7955e89'
LOCK = 'e0edffd8038b97502c8e4a080f9980b9bea49e856719111d2bb7ee615614ce55'
POLICY = 'ece1e8077abaa1dbabf50067a6a315ac8099d445026d8b69b7ae074d228b55f4'
COMPOSER_SHA256 = '1fbb0bd905e5d4f3f4a45fa7bd67867eb061dda5df7892af4dbff9e78605ec8b'
COMPOSER = 'scripts/test2-security-source.py'
DEFINITION = '.github/cloudbuild/backend-test2-buildonly.yaml'
SELF = 'scripts/test2-security-build-context.py'
IMAGE_PREFIX = 'europe-west1-docker.pkg.dev/project-a2e260c1-839d-4f1d-b90/diewish-staging/backend:g1-composed-'
G1_SOURCE = '51ba9fcef7cff7627792303584448c91b05d70dd'
G1_BACKEND = '1314344e010a8d89391bda6a0b1708ec7d9ef213'
G1_LOCK = 'b2de90e8ab8d70da5e844a64cf798b9cdebcc5605511470d8f81f86b323930c7'
G1_MANIFEST = '7ea5a37942dcc8a63aabf0c39ec9e598878dc353d627b5dc45e8791609f573eb'


def require(condition, message):
    if not condition:
        raise RuntimeError('NO_GO: ' + message)


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, check=False)
    require(result.returncode == 0, 'required Git object unavailable')
    return result.stdout


def inputs(build_ref, harness_ref, manifest_sha256, backend_tree, lock_sha256, image):
    require(re.fullmatch(r'[0-9a-f]{40}', build_ref or '') is not None,
            'explicit immutable build-definition commit required')
    require((harness_ref, manifest_sha256, backend_tree, lock_sha256) in
            [(HARNESS, MANIFEST, BACKEND, LOCK), (G1_SOURCE, G1_MANIFEST, G1_BACKEND, G1_LOCK)],
            'inputs differ from accepted composed-source evidence')
    require(image == IMAGE_PREFIX + build_ref, 'only the exact staging composed-build image name is permitted')


def trusted_composer(repo, build_ref):
    require(git(repo, 'rev-parse', 'HEAD').decode().strip() == build_ref, 'build-definition checkout mismatch')
    for relative in (SELF, DEFINITION):
        entry = git(repo, 'ls-tree', build_ref, '--', relative).decode().strip()
        path = repo / relative
        require(entry.startswith('100644 blob ') and path.is_file() and not path.is_symlink()
                and not path.stat().st_mode & 0o111
                and path.read_bytes() == git(repo, 'show', build_ref + ':' + relative),
                'build-definition working content/mode mismatch')
    require(Path(__file__).read_bytes() == (repo / SELF).read_bytes(), 'running guard differs from selected build definition')
    path = repo / COMPOSER
    require(path.is_file() and not path.is_symlink(), 'composer must be an ordinary file')
    data = path.read_bytes()
    # Check bytes before importing/executing the existing composer, not afterwards.
    require(hashlib.sha256(data).hexdigest() == COMPOSER_SHA256, 'accepted composer content mismatch')
    module = types.ModuleType('accepted_test2_composer')
    module.__file__ = str(path)
    exec(compile(data, str(path), 'exec'), module.__dict__)
    return module


def context(mode, repo, source, build_ref, harness_ref, manifest_sha256, backend_tree, lock_sha256, image):
    inputs(build_ref, harness_ref, manifest_sha256, backend_tree, lock_sha256, image)
    if harness_ref == G1_SOURCE:
        return journey_context(mode, repo, source, build_ref, image)
    repo, source = Path(repo).resolve(), Path(source).absolute()
    composer = trusted_composer(repo, build_ref)
    if mode == 'prepare':
        composer.prepare(repo, source, harness_ref=harness_ref)
    else:
        require(mode == 'verify', 'unsupported context mode')
    require(not source.is_symlink(), 'source root symlink')
    manifest = source / 'source-manifest.json'
    require(manifest.is_file() and not manifest.is_symlink()
            and hashlib.sha256(manifest.read_bytes()).hexdigest() == manifest_sha256,
            'accepted source manifest mismatch')
    # No --installed exclusions: a build input must contain exact source only.
    evidence = composer.verify(repo, source, harness_ref=harness_ref)
    require(evidence['backendTree'] == backend_tree and evidence['sourcePolicySha256'] == POLICY
            and evidence['testHarnessCommit'] == HARNESS and evidence['format'] == 3,
            'accepted backend tree/policy/harness mismatch')
    require(hashlib.sha256((source / 'backend/package-lock.json').read_bytes()).hexdigest() == lock_sha256,
            'accepted dependency lock mismatch')
    return {'result': 'PASS', 'purpose': 'VERIFIED_SOURCE_INPUT_NOT_AN_IMAGE_OR_RELEASE',
            'buildDefinitionCommit': build_ref, 'sourceHarnessCommit': HARNESS,
            'sourceManifestSha256': manifest_sha256, 'backendTree': backend_tree,
            'lockSha256': lock_sha256, 'sourcePolicySha256': POLICY,
            'dockerContext': str(source / 'backend'), 'imageNameOnly': image}


def journey_context(mode, repo, source, build_ref, image):
    """Additional explicitly pinned G1 source; the historical composed contract stays intact."""
    repo, source = Path(repo).resolve(), Path(source).absolute()
    require(git(repo, 'rev-parse', 'HEAD').decode().strip() == build_ref, 'build checkout mismatch')
    git(repo, 'merge-base', '--is-ancestor', G1_SOURCE, build_ref)
    require(git(repo, 'rev-parse', build_ref + ':backend').decode().strip() == G1_BACKEND,
            'G1 backend drift')
    for relative in (SELF, DEFINITION):
        path = repo / relative
        require(path.is_file() and not path.is_symlink() and not path.stat().st_mode & 0o111
                and path.read_bytes() == git(repo, 'show', build_ref + ':' + relative),
                'build-definition working content/mode mismatch')
    require(Path(__file__).read_bytes() == (repo / SELF).read_bytes(), 'running guard mismatch')
    files = {}
    for item in git(repo, 'ls-tree', '-r', '-z', build_ref, 'backend').split(b'\0'):
        if not item:
            continue
        meta, name = item.split(b'\t', 1)
        permission, kind, oid = meta.decode().split()
        name = name.decode()
        require(kind == 'blob' and permission in ('100644', '100755')
                and name.startswith('backend/') and '..' not in Path(name).parts, 'unsafe G1 entry')
        files[name] = {'blob': oid, 'mode': permission}
    manifest = {'format': 4, 'applicationCommit': G1_SOURCE, 'backendTree': G1_BACKEND,
                'lockSha256': G1_LOCK, 'files': files}
    encoded = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
    require(hashlib.sha256(encoded).hexdigest() == G1_MANIFEST, 'G1 manifest mismatch')
    require(hashlib.sha256(git(repo, 'show', build_ref + ':backend/package-lock.json')).hexdigest()
            == G1_LOCK, 'G1 dependency lock mismatch')
    require(not source.is_symlink() and not source.resolve().is_relative_to(repo)
            and not repo.is_relative_to(source.resolve()), 'unsafe output root')
    if mode == 'prepare':
        require(not source.exists(), 'output already exists')
        source.mkdir(parents=True)
        for name, entry in files.items():
            target = source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(git(repo, 'show', build_ref + ':' + name))
            target.chmod(0o755 if entry['mode'] == '100755' else 0o644)
        (source / 'source-manifest.json').write_bytes(encoded)
    else:
        require(mode == 'verify', 'unsupported context mode')
    require(not (source / 'source-manifest.json').is_symlink()
            and (source / 'source-manifest.json').read_bytes() == encoded, 'G1 manifest changed')
    actual = set()
    for root, dirs, names in os.walk(source, followlinks=False):
        require(not any((Path(root) / name).is_symlink() for name in dirs), 'G1 directory symlink')
        for name in names:
            path = Path(root) / name
            relative = path.relative_to(source).as_posix()
            if relative == 'source-manifest.json':
                continue
            require(path.is_file() and not path.is_symlink() and relative in files, 'G1 inventory mismatch')
            entry = files[relative]
            data = path.read_bytes()
            oid = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            require(oid == entry['blob'] and bool(path.stat().st_mode & 0o111) == (entry['mode'] == '100755'),
                    'G1 content/mode mismatch')
            actual.add(relative)
    require(actual == set(files), 'G1 inventory mismatch')
    return {'result': 'PASS', 'purpose': 'VERIFIED_SOURCE_INPUT_NOT_AN_IMAGE_OR_RELEASE',
            'buildDefinitionCommit': build_ref, 'sourceHarnessCommit': G1_SOURCE,
            'sourceManifestSha256': G1_MANIFEST, 'backendTree': G1_BACKEND,
            'lockSha256': G1_LOCK, 'dockerContext': str(source / 'backend'), 'imageNameOnly': image}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'verify'])
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--build-ref', required=True)
    parser.add_argument('--harness-ref', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--backend-tree', required=True)
    parser.add_argument('--lock-sha256', required=True)
    parser.add_argument('--image', required=True)
    args = vars(parser.parse_args())
    mode, repo, source = (args.pop(key) for key in ('mode', 'repo', 'source'))
    import json
    print(json.dumps(context(mode, repo, source, **args), sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError):
        print('NO_GO: composed build-input contract failed; no build or cloud operation was invoked', file=sys.stderr)
        raise SystemExit(1)
