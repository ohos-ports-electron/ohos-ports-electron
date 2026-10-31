#!/usr/bin/env python3
"""ports/vscode-native-watchdog/1.4.6 host contract: bundle manifest vs locks.

Validates the CI artifact handoff (manifest.json + candidate.tgz) against the
current checkout's electron-oh/inputs.lock.json and native-artifact.lock.json.
Pure stdlib; no npm/node execution here (host install + suite runs via
tests/run-host.cjs in the compatibility jobs).

Usage: host-contract.py --bundle <dir>
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--bundle', required=True)
    args = ap.parse_args()

    bundle = Path(args.bundle)
    manifest_path = bundle / 'manifest.json'
    tgz = bundle / 'candidate.tgz'
    if not manifest_path.is_file() or not tgz.is_file():
        print('bundle incomplete: manifest.json / candidate.tgz missing', file=sys.stderr)
        return 1

    here = Path(__file__).resolve().parent
    lock = json.loads((here / '..' / 'inputs.lock.json').read_text(encoding='utf-8'))
    native_lock = json.loads((here / '..' / 'native-artifact.lock.json').read_text(encoding='utf-8'))

    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    tgz_sha = sha256_file(tgz)

    problems = []
    if manifest.get('name') != lock['candidate']['name']:
        problems.append('manifest.name != inputs.lock.candidate.name')
    if manifest.get('version') != lock['candidate']['version']:
        problems.append('manifest.version != inputs.lock.candidate.version')
    if tgz_sha != lock['candidate']['tarballSha256']:
        problems.append(f'candidate.tgz sha256 {tgz_sha} != locked {lock["candidate"]["tarballSha256"]}')
    if manifest.get('tarSha256') != lock['candidate']['tarSha256']:
        problems.append('manifest.tarSha256 != inputs.lock.candidate.tarSha256')
    if manifest.get('builtFrom', {}).get('baseline', {}).get('sha256') != lock['library']['tarballSha256']:
        problems.append('manifest baseline sha256 != inputs.lock.library.tarballSha256')
    for member, sha in native_lock['files'].items():
        if member not in manifest.get('builtFrom', {}).get('native', {}).get('members', []):
            problems.append(f'native member {member} not recorded in manifest')
    if manifest.get('matchesLock') is not True:
        problems.append('manifest.matchesLock is not true')

    if problems:
        print('host contract failed:\n  ' + '\n  '.join(problems), file=sys.stderr)
        return 1
    print(f"host contract ok: {lock['candidate']['name']}@{lock['candidate']['version']} tgz={tgz_sha}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
