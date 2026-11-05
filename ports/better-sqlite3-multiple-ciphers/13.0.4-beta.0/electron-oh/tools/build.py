#!/usr/bin/env python3
"""Build deterministic npm bytes for @ohos-ports-electron/better-sqlite3-multiple-ciphers.

The candidate = locked registry baseline tgz + lib/ patches
(BETTER_SQLITE3_NATIVE_BINDING + openharmony/ohos platform static entries in
binding.js and new lib/{openharmony,ohos}-{arm64,x64}.js) + metadata rewrite
(name/version/repository) + prebuilds/openharmony-arm64.node (device ABI).

Device ABI addon (dist/lib/node/better_sqlite3.node) and Electron ABI addon
(dist/lib/electron/better_sqlite3.node) are cross-compiled OHOS artifacts whose
bytes are locked in inputs.lock.json (prebuiltDeviceNodeSha256). This script
injects the device addon as prebuilds/openharmony-arm64.node; the Electron addon
is host-supplied via demo nativeFiles and never enters the npm package.

The OhosAgent build (build_ohos_bundle in tools/) reproduces the same tgz from
the locked baseline; CI host jobs verify hashes and inventory without re-packing.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tarfile
import urllib.request

def sha(data): return hashlib.sha256(data).hexdigest()

BINDING_PLATFORM_LINE = "const PREBUILD_PLATFORMS = ['linux', 'darwin', 'win32'];"
BINDING_PLATFORM_NEW = "const PREBUILD_PLATFORMS = ['linux', 'darwin', 'win32', 'openharmony'];"
BINDING_MARKER = "\t// If an object was provided, use it as the binding directly."
BINDING_ENV_BLOCK = '''
	if (process.env.BETTER_SQLITE3_NATIVE_BINDING) {
		return require(process.env.BETTER_SQLITE3_NATIVE_BINDING);
	}
'''

def static_entry(arch):
    prebuild = 'openharmony-arm64.node' if arch == 'arm64' else 'openharmony-x64.node'
    return ("'use strict';\n"
            "module.exports = require('./database')(\n"
            "\t() => process.env.BETTER_SQLITE3_NATIVE_BINDING\n"
            "\t\t? require(process.env.BETTER_SQLITE3_NATIVE_BINDING)\n"
            f"\t\t: require('../prebuilds/{prebuild}'),\n"
            "\tfalse);\n"
            "module.exports.SqliteError = require('./sqlite-error');\n")

def build(port, out, archive=None, device_addon=None):
    lock = json.loads((port / 'electron-oh/inputs.lock.json').read_text(encoding='utf-8'))
    if out.exists():
        raise RuntimeError(f'Output already exists: {out}')
    out.mkdir(parents=True)
    if archive:
        data = Path(archive).read_bytes()
    else:
        data = urllib.request.urlopen(lock['baseline']['url'], timeout=60).read()
    assert sha(data) == lock['baseline']['sha256'], 'baseline SHA256 mismatch'
    assert 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode() == lock['baseline']['integrity']
    (out / 'baseline.tgz').write_bytes(data)
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        names = t.getnames()
        assert len(names) == len(set(names))
        assert all(n.startswith('package/') and '..' not in Path(n).parts for n in names)
        assert all(m.isfile() or m.isdir() for m in t.getmembers())
        t.extractall(out / 'staging', filter='data')
    stage = out / 'staging/package'

    # lib/binding.js: BETTER_SQLITE3_NATIVE_BINDING + openharmony prebuild resolution
    bp = stage / 'lib/binding.js'
    text = bp.read_text(encoding='utf-8')
    assert BINDING_PLATFORM_LINE in text
    text = text.replace(BINDING_PLATFORM_LINE, BINDING_PLATFORM_NEW)
    if 'BETTER_SQLITE3_NATIVE_BINDING' not in text:
        assert BINDING_MARKER in text
        text = text.replace(BINDING_MARKER, BINDING_ENV_BLOCK + BINDING_MARKER)
    bp.write_text(text, encoding='utf-8', newline='\n')

    # static entries: openharmony + ohos (e40 main process reports platform=ohos)
    (stage / 'lib' / 'openharmony-arm64.js').write_text(static_entry('arm64'), encoding='utf-8', newline='\n')
    (stage / 'lib' / 'openharmony-x64.js').write_text(static_entry('x64'), encoding='utf-8', newline='\n')
    (stage / 'lib' / 'ohos-arm64.js').write_text(static_entry('arm64'), encoding='utf-8', newline='\n')
    (stage / 'lib' / 'ohos-x64.js').write_text(static_entry('x64'), encoding='utf-8', newline='\n')

    # device ABI addon as prebuilds/openharmony-arm64.node
    prebuilds = stage / 'prebuilds'
    prebuilds.mkdir(parents=True, exist_ok=True)
    addon = Path(device_addon) if device_addon else None
    if addon is None:
        raise RuntimeError('device addon required: pass --device-addon <better_sqlite3.node>')
    assert sha(addon.read_bytes()) == lock['candidate']['prebuiltDeviceNodeSha256']
    shutil.copyfile(addon, prebuilds / 'openharmony-arm64.node')

    # metadata rewrite
    meta_path = stage / 'package.json'
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    cand = lock['candidate']
    meta['name'] = cand['name']
    meta['version'] = cand['version']
    meta['description'] = meta['description'] + f" (HarmonyOS PC / ohos-ports port of {lock['baseline']['name']})"
    meta['repository'] = cand['repository']
    for sub in ('openharmony-arm64', 'openharmony-x64', 'ohos-arm64', 'ohos-x64'):
        meta['exports'][f'./{sub}'] = f'./lib/{sub}.js'
    meta_path.write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8', newline='\n')
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    assert all(meta[k] == cand[k] for k in ('name', 'version'))
    assert meta['repository'] == cand['repository']
    assert not any(k in meta.get('scripts', {}) for k in ('preinstall', 'install', 'postinstall'))

    # deterministic pack: npm pack (byte-identical to the frozen device-verified
    # candidate tgz; the OhosAgent build-candidate.cjs produces the same bytes)
    import subprocess, tempfile
    npm = shutil.which('npm.cmd') if os.name == 'nt' else shutil.which('npm')
    pack = subprocess.run([npm, 'pack', '--silent'], cwd=stage, capture_output=True, text=True, timeout=120, shell=(os.name == 'nt'))
    if pack.returncode != 0:
        raise RuntimeError(f'npm pack failed: {pack.stderr or pack.stdout}')
    packed = (pack.stdout.strip().splitlines()[-1])
    (out / 'candidate.tgz').write_bytes((stage / packed).read_bytes())
    tarbytes = (out / 'candidate.tgz').read_bytes()
    with tarfile.open(fileobj=io.BytesIO(tarbytes)) as t:
        inventory = {m.name[8:]: hashlib.sha256(t.extractfile(m).read()).hexdigest() for m in t.getmembers() if m.isfile()}
    receipt = {'name': meta['name'], 'version': meta['version'], 'sha256': sha(tarbytes),
               'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(tarbytes).digest()).decode(),
               'files': inventory, 'baselineSha256': sha(data)}
    (out / 'manifest.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({k: v for k, v in receipt.items() if k != 'files'}, indent=2))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--archive', type=Path, default=None)
    p.add_argument('--device-addon', type=Path, default=None)
    a = p.parse_args()
    build(a.port.resolve(), a.output.resolve(), a.archive, a.device_addon)
