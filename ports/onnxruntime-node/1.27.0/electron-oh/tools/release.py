#!/usr/bin/env python3
"""Bind one tgz to this checkout and reviewed device evidence; publishing fails closed."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ADAPTER = Path(__file__).resolve().parent.parent
PORT = ADAPTER.parent


def require(value, message):
    if not value:
        raise ValueError(message)


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.digest()


def sha(path):
    return digest(path).hex()


def recipe_files():
    result = {}
    for path in sorted(PORT.rglob('*')):
        if any(part in ('__pycache__', '.DS_Store') for part in path.relative_to(PORT).parts):
            continue
        require(not path.is_symlink(), 'recipe symlink is not allowed')
        if path.is_file():
            result[path.relative_to(PORT).as_posix()] = sha(path)
    return result


def git(*args):
    return subprocess.check_output(['git', '-C', str(PORT), *args], text=True).strip()


def check_recipe():
    lock = read(ADAPTER / 'inputs.lock.json')
    native = read(ADAPTER / 'native-inputs.lock.json')
    evidence = read(ADAPTER / 'release-evidence.json')
    policy = read(ADAPTER / 'release-policy.json')
    require(lock['candidate'] == {'name': policy['packageName'], 'version': policy['packageVersion']}, 'package identity mismatch')
    require((evidence['packageName'], evidence['packageVersion']) == (policy['packageName'], policy['packageVersion']), 'evidence identity mismatch')
    for mapping in ('packagePatches', 'nativeSourcePatches'):
        for name, expected in lock[mapping].items():
            require(Path(name).name == name and sha(PORT / 'patchs' / name) == expected, 'patch checksum mismatch: ' + name)
    for directory, values in [('native/licenses', native['licenseFiles']),
                              ('native/vendor/electron-napi-library', native['shim']['headers']),
                              ('tests/fixtures', read(ADAPTER / 'tests/fixtures.lock.json')['files'])]:
        for name, expected in values.items():
            require(sha(ADAPTER / directory / name) == expected, 'support input mismatch: ' + name)
    inventory = read(ADAPTER / 'package-inventory.json')
    require(inventory['candidateSha256'] == evidence['candidateSha256'], 'inventory candidate mismatch')
    require({f['path']: f['sha256'] for f in inventory['files']} == evidence['packageFiles'], 'inventory file mismatch')
    require(sha(ADAPTER / 'PACKAGE_README.md') == evidence['packageFiles']['README.md'], 'packaged README mirror mismatch')
    targets = evidence['deviceTargets']
    require(evidence['functionStatus'] == 'passed', 'function evidence incomplete')
    require(set(evidence['requiredDeviceTargets']) == {t['runtimeId'] for t in targets} and len(targets) == 5, 'five required device targets missing')
    require(set(policy['hostNodeVersions']) == {t['nodeVersion'] for t in targets}, 'host matrix differs from device versions')
    roles = {role for t in targets for role in t['roles']}
    require({'electron25', 'electron34', 'electron37', 'electron40', 'node'} <= roles, 'required device roles missing')
    for target in targets:
        require(target['execution'] == 'device' and target['status'] == 'passed', 'non-device or failed evidence')
        require(target['packageSha256'] == evidence['candidateSha256'], 'device candidate mismatch')
        require(len(target['runs']) >= 2 and len({r['pid'] for r in target['runs']}) >= 2, 'two distinct cold starts required')
        require(all(r['pass'] == 20 and r['fail'] == 0 for r in target['runs']), 'incomplete device cases')
    return lock, evidence, policy


def package_inventory(tgz):
    files, meta = {}, None
    with tarfile.open(tgz) as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts and path.parts[0] == 'package', 'unsafe archive path')
            require(member.isdir() or member.isfile(), 'archive links/devices are forbidden')
            if not member.isfile():
                continue
            name = '/'.join(path.parts[1:])
            require(name and name not in files, 'duplicate/empty archive entry')
            stream = archive.extractfile(member)
            if name == 'package.json':
                content = stream.read()
                meta = json.loads(content)
                files[name] = hashlib.sha256(content).hexdigest()
            else:
                h = hashlib.sha256()
                for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                    h.update(block)
                files[name] = h.hexdigest()
    return files, meta


def verify_candidate(bundle):
    lock, evidence, policy = check_recipe()
    tgz = bundle / 'candidate.tgz'
    require(sha(tgz) == evidence['candidateSha256'], 'tgz SHA256 differs from device-validated candidate')
    integrity = 'sha512-' + base64.b64encode(digest(tgz, 'sha512')).decode()
    require(integrity == evidence['candidateIntegrity'], 'candidate integrity mismatch')
    files, meta = package_inventory(tgz)
    require(files == evidence['packageFiles'], 'complete npm inventory differs from device-validated candidate')
    require((meta['name'], meta['version']) == (policy['packageName'], policy['packageVersion']), 'tgz identity mismatch')
    require(meta['repository']['url'] == 'git+https://github.com/' + policy['repository'] + '.git', 'tgz repository mismatch')
    require(meta['repository']['directory'] == policy['portDirectory'], 'tgz repository directory mismatch')
    result = read(bundle / 'candidate.json')
    require(result['sha256'] == evidence['candidateSha256'] and result['packageFiles'] == files, 'build metadata mismatch')
    require(files['electron-oh-native.json'] == evidence['nativeArtifactsManifestSha256'], 'native manifest mismatch')
    require(result['nativeArtifacts']['nativeInputsLockSha256'] == sha(ADAPTER / 'native-inputs.lock.json'), 'native lock mismatch')
    return evidence, policy


def seal(bundle):
    evidence, _ = verify_candidate(bundle)
    manifest = {'schemaVersion': 1, 'checkoutSha': git('rev-parse', 'HEAD'),
                'runId': os.environ.get('GITHUB_RUN_ID'), 'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
                'candidateSha256': evidence['candidateSha256'],
                'payloadFiles': {name: sha(bundle / name) for name in ('candidate.tgz', 'candidate.json')},
                'recipeFiles': recipe_files()}
    write(bundle / 'bundle.json', manifest)
    print(json.dumps({'status': 'sealed', 'candidateSha256': evidence['candidateSha256'], 'releaseStatus': evidence['release']['status']}))


def verify(bundle):
    evidence, policy = verify_candidate(bundle)
    manifest = read(bundle / 'bundle.json')
    require(manifest['recipeFiles'] == recipe_files(), 'artifact recipe differs from current checkout')
    require(manifest['checkoutSha'] == git('rev-parse', 'HEAD'), 'artifact belongs to another checkout commit')
    require(manifest['candidateSha256'] == evidence['candidateSha256'], 'artifact candidate mismatch')
    require(manifest['payloadFiles'] == {name: sha(bundle / name) for name in ('candidate.tgz', 'candidate.json')}, 'artifact payload modified')
    for key, env in [('runId', 'GITHUB_RUN_ID'), ('runAttempt', 'GITHUB_RUN_ATTEMPT')]:
        if os.environ.get(env):
            require(manifest[key] == os.environ[env], 'artifact belongs to another workflow run')
    return evidence, policy


def check_context(env, policy, checkout):
    expected = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'push',
                'GITHUB_REPOSITORY': policy['repository'], 'GITHUB_REF': policy['publishRef'],
                'GITHUB_ENVIRONMENT': policy['environment'], 'GITHUB_SHA': checkout,
                'GITHUB_WORKFLOW_REF': policy['repository'] + '/.github/workflows/' + policy['workflowFilename'] + '@' + policy['publishRef']}
    for name, value in expected.items():
        require(env.get(name) == value, 'publish context rejected: ' + name)


def check_ready(evidence):
    require(evidence['release']['status'] == 'ready' and not evidence['release']['reasons'],
            'release is blocked: ' + '; '.join(evidence['release']['reasons']))
    source = evidence['sourceEvidence']
    require(source['reportsArchived'] and str(source.get('archiveUrl', '')).startswith('https://') and len(source.get('archiveSha256', '')) == 64, 'full device evidence must be archived for review')
    prerequisites = evidence['releasePrerequisites']
    node = prerequisites['standaloneNodeArchive']
    node_target = next(t for t in evidence['deviceTargets'] if 'node' in t['roles'])
    require(node['status'] == 'passed' and str(node['url']).startswith('https://') and
            isinstance(node['sha256'], str) and len(node['sha256']) == 64 and
            node['engineSha256'] == node_target['engineSha256'], 'standalone Node archive provenance incomplete')
    lifecycle = prerequisites['targetNpmLifecycle']
    require(lifecycle['status'] == 'passed' and
            {r['runtimeId'] for r in lifecycle['reports']} == set(evidence['requiredDeviceTargets']),
            'target npm CLI lifecycle evidence incomplete')
    for report in lifecycle['reports']:
        require(report['execution'] == 'device' and report['status'] == 'passed' and
                report['packageSha256'] == evidence['candidateSha256'] and
                report['postinstallExecuted'] is True and str(report['reportUrl']).startswith('https://') and
                len(report['reportSha256']) == 64, 'target npm CLI lifecycle report mismatch')


def registry_version(policy, opener=urllib.request.urlopen):
    url = policy['registry'] + urllib.parse.quote(policy['packageName'], safe='@') + '/' + urllib.parse.quote(policy['packageVersion'], safe='')
    try:
        with opener(url, timeout=60) as response:
            require(response.status == 200, 'unexpected registry response')
            return json.load(response)['dist']['integrity']
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise ValueError('registry lookup failed: HTTP ' + str(error.code)) from error


def registry_action(existing, expected):
    if existing is None:
        return 'publish'
    require(existing == expected, 'existing version has different bytes; increment version and revalidate')
    return 'already-published'


def registry_package_exists(policy, token, opener=urllib.request.urlopen):
    request = urllib.request.Request(policy['registry'] + urllib.parse.quote(policy['packageName'], safe='@'),
                                     headers={'Authorization': 'Bearer ' + token})
    try:
        with opener(request, timeout=60) as response:
            require(response.status == 200, 'unexpected package lookup response')
            require(json.load(response)['name'] == policy['packageName'], 'package lookup identity mismatch')
            return True
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise ValueError('authenticated package lookup failed: HTTP ' + str(error.code)) from error


def check_bootstrap(token, package_exists):
    require(bool(token), 'bootstrap requires the protected NPM_BOOTSTRAP_TOKEN secret')
    require(not package_exists, 'bootstrap only creates a missing package; use OIDC for an existing package')


def publish(bundle, mode='oidc'):
    # Reject untrusted invocations before any registry access or upload.
    _, evidence, policy = check_recipe()
    check_context(os.environ, policy, git('rev-parse', 'HEAD'))
    check_ready(evidence)
    require(not git('status', '--porcelain'), 'publishing requires a clean checkout')
    verify(bundle)
    subprocess.run([sys.executable, str(ADAPTER / 'tools/verify-evidence.py')], check=True)
    action = registry_action(registry_version(policy), evidence['candidateIntegrity'])
    if action == 'already-published':
        print(action)
        return
    require(mode in ('oidc', 'bootstrap'), 'unknown publish authentication mode')
    token = os.environ.get('NPM_BOOTSTRAP_TOKEN', '') if mode == 'bootstrap' else ''
    if mode == 'bootstrap':
        require(bool(token), 'bootstrap requires the protected NPM_BOOTSTRAP_TOKEN secret')
        check_bootstrap(token, registry_package_exists(policy, token))
    # Keep authentication out of the recipe/artifact and ignore ambient npm credentials.
    with tempfile.TemporaryDirectory(prefix='onnx-publish-auth-') as temp:
        userconfig = Path(temp) / 'npmrc'
        globalconfig = Path(temp) / 'global-npmrc'
        userconfig.write_text('//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n' if token else '')
        globalconfig.write_text('')
        child_env = dict(os.environ, NPM_CONFIG_USERCONFIG=str(userconfig), NPM_CONFIG_GLOBALCONFIG=str(globalconfig))
        for name in ('NODE_AUTH_TOKEN', 'NPM_TOKEN', 'NPM_BOOTSTRAP_TOKEN'):
            child_env.pop(name, None)
        if token:
            child_env['NODE_AUTH_TOKEN'] = token
        subprocess.run(['npm', 'publish', str((bundle / 'candidate.tgz').resolve()), '--registry', policy['registry'],
                        '--access', 'public', '--tag', policy['distTag'], '--provenance', '--ignore-scripts'], env=child_env, check=True)
    require(registry_version(policy) == evidence['candidateIntegrity'], 'post-publish integrity mismatch')
    print('published verified frozen candidate')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('check', 'seal', 'verify', 'publish'))
    parser.add_argument('--bundle', '--output', type=Path, dest='bundle')
    # build.sh forwards the same build arguments to seal; these are never used as authority.
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--native-artifacts', type=Path)
    parser.add_argument('--mode', choices=('oidc', 'bootstrap'), default='oidc')
    args = parser.parse_args()
    if args.operation == 'check':
        check_recipe()
        print('recipe checks passed')
    else:
        require(args.bundle is not None, 'bundle directory required')
        if args.operation == 'seal':
            seal(args.bundle)
        elif args.operation == 'verify':
            evidence, _ = verify(args.bundle)
            print(json.dumps({'status': 'verified', 'releaseStatus': evidence['release']['status']}))
        else:
            publish(args.bundle, args.mode)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
