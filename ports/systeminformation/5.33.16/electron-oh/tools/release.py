#!/usr/bin/env python3
"""Candidate validation and release guards for @ohos-ports-electron/systeminformation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

ELECTRON = Path(__file__).resolve().parent
PORT = ELECTRON.parent
REPOSITORY = 'ohos-ports-electron/ohos-ports-electron'
WORKFLOW = '.github/workflows/systeminformation-electron-oh.yml'
ENVIRONMENT = 'npm-publish'
REGISTRY = 'https://registry.npmjs.org/'

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def require(ok, message):
    if not ok:
        raise ValueError(message)

def validate(bundle):
    bundle = Path(bundle)
    meta = read(bundle / 'meta.json')
    require(meta['packageName'] == '@ohos-ports-electron/systeminformation', 'wrong package name')
    require(meta['packageVersion'] == '5.33.16-electron-oh.0', 'wrong package version')
    candidate_sha = sha(bundle / 'candidate.tgz')
    require(candidate_sha == meta['candidateSha256'], 'candidate hash mismatch vs meta')
    lock = read(ELECTRON.parent / 'inputs.lock.json')
    require(candidate_sha == lock['candidate']['tgzSha256'], 'candidate hash mismatch vs inputs.lock')
    evidence = read(ELECTRON.parent / 'release-evidence.json')
    require(evidence.get('releaseStatus') == 'blocked', 'release evidence not blocked')
    require(evidence.get('candidateSha256') == candidate_sha, 'release evidence not bound to candidate')
    return {**meta, 'candidateSha256': candidate_sha, 'lock': lock, 'evidence': evidence}

def ci_guard(env=None):
    env = env or os.environ
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY, 'wrong repository')
    require(env.get('GITHUB_EVENT_NAME') == 'push', 'not a push event')
    require(env.get('GITHUB_REF') == 'refs/heads/main', 'wrong branch')
    require(env.get('GITHUB_WORKFLOW_REF', '') == REPOSITORY + '/' + WORKFLOW + '@refs/heads/main', 'wrong workflow identity')
    require(env.get('GITHUB_ENVIRONMENT') == ENVIRONMENT, 'wrong release environment')

def registry_version(spec):
    url = REGISTRY + spec.replace('/', '%2f')
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def publish(bundle, execute=False):
    if not execute:
        print('DRY RUN: would publish candidate.tgz for', read(bundle / 'meta.json')['packageName'])
        return
    raise RuntimeError('systeminformation release is BLOCKED; do not publish')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    meta = validate(args.bundle)
    print('validate OK: ' + meta['packageName'] + '@' + meta['packageVersion'] + ' sha=' + meta['candidateSha256'][:12])
    if args.execute:
        publish(args.bundle, True)

if __name__ == '__main__':
    main()
