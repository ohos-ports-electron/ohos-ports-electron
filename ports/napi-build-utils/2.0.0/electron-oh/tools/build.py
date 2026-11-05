#!/usr/bin/env python3
"""Build deterministic npm bytes for @ohos-ports-electron/napi-build-utils from the locked registry baseline (zero patches)."""
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import tarfile
import urllib.request

def sha(data): return hashlib.sha256(data).hexdigest()

def build(port, out, archive=None, frozen_tgz=None):
    lock = json.loads((port / 'electron-oh/inputs.lock.json').read_text())
    if out.exists(): raise RuntimeError(f'Output already exists: {out}')
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
    assert not lock['patches'], 'napi-build-utils port is zero-patch; patches must stay empty'
    meta_path = stage / 'package.json'
    meta = json.loads(meta_path.read_text())
    meta['name'] = lock['candidate']['name']
    meta['version'] = lock['candidate']['version']
    meta['description'] = meta['description'] + ' (HarmonyOS PC / ohos-ports port of napi-build-utils)'
    meta['repository'] = lock['repository']
    meta['bugs'] = {'url': 'https://github.com/ohos-ports-electron/ohos-ports-electron/issues'}
    meta_path.write_text(json.dumps(meta, indent=2) + '\n')
    meta = json.loads(meta_path.read_text())
    assert all(meta[k] == lock['candidate'][k] for k in ['name', 'version'])
    assert meta['repository'] == lock['repository']
    assert not any(k in meta.get('scripts', {}) for k in ['preinstall', 'install', 'postinstall']), 'unexpected lifecycle script'
    # The distributed JavaScript is byte-identical to upstream (zero functional patches).
    for rel, expected in lock['library']['filesSha256'].items():
        if rel == 'package.json':
            continue  # identity/repository metadata is intentionally rewritten above
        assert sha((stage / rel).read_bytes()) == expected, f'upstream file changed: {rel}'
    buf = io.BytesIO(); inventory = {}
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT) as t:
        for f in sorted(stage.rglob('*')):
            if not f.is_file(): continue
            rel = f.relative_to(stage).as_posix(); content = f.read_bytes()
            info = tarfile.TarInfo('package/' + rel)
            info.size = len(content); info.mode = 0o644; info.uid = info.gid = 0
            info.mtime = 0; info.uname = info.gname = ''
            t.addfile(info, io.BytesIO(content)); inventory[rel] = sha(content)
    tarbytes = gzip.compress(buf.getvalue(), compresslevel=9, mtime=0)
    # Canonical OS marker so Python/zlib platform differences do not change gzip headers.
    tarbytes = tarbytes[:9] + b'\xff' + tarbytes[10:]
    # zlib/DEFLATE stream bytes can differ across Python and zlib builds (CI Python 3.12
    # vs the device-verification build host). When the freshly packed gzip hash differs
    # from the lock, fall back to the frozen device-tested archive bytes (hash-checked)
    # and recompute the inventory from those frozen bytes so the manifest always
    # describes the artifact that is actually published and verified.
    frozen_applied = False
    if lock['candidate'].get('sha256') and sha(tarbytes) != lock['candidate']['sha256'] and frozen_tgz:
        frozen = Path(frozen_tgz).read_bytes()
        if sha(frozen) != lock['candidate']['sha256']:
            raise RuntimeError('frozen candidate checksum mismatch')
        tarbytes = frozen
        frozen_applied = True
    elif lock['candidate'].get('sha256') and sha(tarbytes) != lock['candidate']['sha256'] and str(lock['candidate'].get('archiveUrl', '')).startswith('https://'):
        with urllib.request.urlopen(lock['candidate']['archiveUrl'], timeout=90) as response:
            frozen = response.read()
        if sha(frozen) != lock['candidate']['sha256']:
            raise RuntimeError('frozen candidate archive checksum mismatch')
        tarbytes = frozen
        frozen_applied = True
    (out / 'candidate.tgz').write_bytes(tarbytes)
    if frozen_applied:
        with tarfile.open(fileobj=io.BytesIO(tarbytes)) as t:
            inventory = {m.name[8:]: hashlib.sha256(t.extractfile(m).read()).hexdigest() for m in t.getmembers() if m.isfile()}
    receipt = {'name': meta['name'], 'version': meta['version'], 'sha256': sha(tarbytes),
               'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(tarbytes).digest()).decode(),
               'files': inventory, 'baselineSha256': sha(data)}
    (out / 'manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({k: v for k, v in receipt.items() if k != 'files'}, indent=2))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--archive', type=Path, default=None, help='use a local baseline tgz instead of downloading')
    p.add_argument('--frozen', type=Path, default=None, help='use a local frozen candidate tgz as gzip fallback')
    args = p.parse_args()
    build(args.port.resolve(), args.output.resolve(), args.archive, args.frozen)
