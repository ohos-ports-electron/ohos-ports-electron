#!/usr/bin/env python3
"""Verify the build handoff and device evidence; only main CI can upload."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from workflow import ELECTRON, PORT, read, require, sha, verify, compare

REPOSITORY = 'ohos-ports-electron/ohos-ports-electron'
WORKFLOW = '.github/workflows/npm-publish.yml'
REGISTRY = 'https://registry.npmjs.org/'


def validate(bundle):
    manifest = verify(bundle, 'bundle.json')
    lock = read(ELECTRON / 'inputs.lock.json')
    require(read(bundle / 'recipe/inputs.lock.json') == lock, 'artifact uses a different input lock')
    for name in ('inputs.lock.json', 'install.cjs', 'PACKAGE_README.md'):
        require((bundle / 'recipe' / name).read_bytes() == (ELECTRON / name).read_bytes(), 'artifact recipe differs: ' + name)
    for name, digest in lock['patches'].items():
        require(sha(PORT / 'patchs' / name) == sha(bundle / 'recipe/patchs' / name) == digest, 'patch differs: ' + name)
    require(sha(bundle / 'baseline.tgz') == lock['baseline']['sha256'], 'baseline differs')
    result = compare(bundle / 'baseline.tgz', bundle / 'candidate.tgz', lock)
    require(manifest['packageFiles'] == result['packageFiles'], 'package file map differs')
    require((manifest['packageName'], manifest['packageVersion']) == (lock['packageName'], lock['packageVersion']), 'wrong artifact identity')
    require(manifest['packageName'].startswith('@ohos-ports-electron/'), 'wrong destination scope')
    evidence = read(ELECTRON / 'release-evidence.json')
    require(evidence['packageName'] == manifest['packageName'] and evidence['packageVersion'] == manifest['packageVersion'], 'wrong evidence identity')
    require(sha(bundle / 'candidate.tgz') == manifest['candidateSha256'] == evidence['candidateSha256'], 'candidate has no matching device validation')
    expected = {
        'node': ('24.13.0', None, 'openharmony'),
        'electron34': ('20.18.1', '0.0.0-no-git-tag-found', 'ohos'),
        'electron37': ('22.17.0', '37.2.0', 'openharmony'),
        'electron40': ('24.11.1', '40.1.0', 'ohos'),
    }
    for host, (node, electron, platform) in expected.items():
        r = evidence['reports'][host]
        require(r['packageName'] == manifest['packageName'] and r['packageVersion'] == manifest['packageVersion'] and r['packageSha256'] == manifest['candidateSha256'], host + ': different package')
        require(r['status'] == 'passed' and r['pass'] == r['total'] == 10 and r['fail'] == 0, host + ': failed checks')
        require(len(r['pids']) == len(set(r['pids'])) == 2 and all(isinstance(pid, int) and pid > 0 for pid in r['pids']), host + ': missing cold starts')
        require(r['persistentIdStable'] is True and r['signatureVerified'] is True, host + ': missing persistence/signature proof')
        require(r['versions']['node'] == node and r['versions'].get('electron') == electron and r['platform'] == platform and r['arch'] == 'arm64', host + ': wrong runtime')
    require(evidence['reports']['electron34']['runtimeFiles']['libelectron.so'] == lock['validatedRuntimes']['electron34']['engineSha256'], 'wrong Electron-OH 34 engine')
    return manifest


def ci_guard(env=None):
    env = os.environ if env is None else env
    require(env.get('GITHUB_ACTIONS') == 'true', 'upload requires GitHub Actions')
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY, 'wrong repository')
    require(env.get('GITHUB_EVENT_NAME') == 'push' and env.get('GITHUB_REF') == 'refs/heads/main', 'upload requires push to main')
    require(env.get('GITHUB_WORKFLOW_REF', '') == REPOSITORY + '/' + WORKFLOW + '@refs/heads/main', 'wrong workflow identity')
    require(env.get('GITHUB_ENVIRONMENT') == 'npm-publish', 'wrong release environment')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=PORT, text=True).strip()
    require(env.get('GITHUB_SHA') == head, 'checkout differs from triggering commit')


def registry_version(spec):
    # Public registry reads need no credentials. Only HTTP 404 means unpublished;
    # authentication, rate limits, connectivity and malformed responses must fail.
    url = REGISTRY + urllib.parse.quote(spec, safe='@/')
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def publish(bundle, execute=False):
    if execute:
        ci_guard()
    manifest = validate(bundle)
    candidate = bundle / 'candidate.tgz'
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(candidate.read_bytes()).digest()).decode()
    spec = manifest['packageName'] + '/' + manifest['packageVersion']
    existing = registry_version(spec)
    if existing is not None:
        require(existing['dist']['integrity'] == integrity, 'immutable npm version exists with different bytes; increment revision and revalidate')
        print(json.dumps({'status': 'already-published', 'package': manifest['packageName'] + '@' + manifest['packageVersion'], 'uploadPerformed': False}))
        return
    if not execute:
        print(json.dumps({'status': 'verified-no-upload', 'uploadPerformed': False}))
        return
    # Explicit CLI --tag overrides publishConfig.tag in the frozen archive.
    # latest is the supported automatic channel; electron-oh is a historical tag.
    subprocess.run(['npm', 'publish', str(candidate), '--ignore-scripts', '--access', 'public', '--tag', 'latest', '--provenance', '--registry', REGISTRY], check=True)
    published = registry_version(spec)
    require(published is not None and published['dist']['integrity'] == integrity, 'registry verification failed after upload')
    print(json.dumps({'status': 'published-and-verified', 'candidateSha256': manifest['candidateSha256'], 'tag': 'latest'}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    publish(args.bundle.resolve(), args.execute)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
