#!/usr/bin/env python3
"""Static release-contract checks for the better-sqlite3-multiple-ciphers port."""
import json
from pathlib import Path

PORT = Path(__file__).resolve().parents[1]
lock = json.loads((PORT / 'inputs.lock.json').read_text())
inv = json.loads((PORT / 'package-inventory.json').read_text())
evidence = json.loads((PORT / 'release-evidence.json').read_text())

def req(cond, msg):
    if not cond:
        raise SystemExit(f'RELEASE CONTRACT FAILED: {msg}')

req(lock['candidate']['name'] == '@ohos-ports-electron/better-sqlite3-multiple-ciphers', 'candidate name')
req(lock['candidate']['version'] == '13.0.4-beta.0-electron-oh.0', 'candidate version')
req(lock['baseline']['name'] == 'better-sqlite3-multiple-ciphers', 'baseline name')
req(lock['requiredDistTags'] == ['latest', 'beta'], 'dist-tags')
req(len(inv) == 73, f'unexpected package file count {len(inv)}')
req('prebuilds/openharmony-arm64.node' in inv, 'missing openharmony device prebuild')
for sub in ('openharmony-arm64', 'openharmony-x64', 'ohos-arm64', 'ohos-x64'):
    req(f'lib/{sub}.js' in inv, f'missing {sub} entry')
req(evidence['candidateSha256'] == lock['candidate']['sha256'], 'evidence candidate mismatch')
req(evidence['blocked']['electron34']['napi'] == 9, 'e34 blocked napi 9')
for role in ('node', 'electron37', 'electron40'):
    t = evidence['targets'][role]
    req(t['candidate']['status'] == 'passed' and len(t['candidate']['coldStarts']) >= 2, f'{role} candidate not passed twice')
    req(all(cs['pass'] == cs['total'] == 351 for cs in t['candidate']['coldStarts']), f'{role} candidate not 351/351')
print('release contract OK')
