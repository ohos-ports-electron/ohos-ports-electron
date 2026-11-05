#!/usr/bin/env python3
"""Build deterministic npm bytes from a checked registry baseline and recipe."""
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request

def sha(data): return hashlib.sha256(data).hexdigest()

def build(port, out):
    lock = json.loads((port / 'electron-oh/inputs.lock.json').read_text())
    if out.exists(): raise RuntimeError(f'Output already exists: {out}')
    out.mkdir(parents=True)
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
    for item in lock['patches']:
        patch = port / item['path']; assert sha(patch.read_bytes()) == item['sha256']
        subprocess.run(['patch', '--batch', '--forward', '--fuzz=0', '-p1', '-i', str(patch)], cwd=stage, check=True)
    readme = port / 'electron-oh/PACKAGE_README.md'
    assert sha(readme.read_bytes()) == lock['readmeSha256']
    upstream_readme = stage / 'readme.md'
    if not upstream_readme.exists(): upstream_readme = stage / 'README.md'
    shutil.copyfile(upstream_readme, stage / 'README.upstream.md')
    shutil.copyfile(readme, upstream_readme)
    native=lock['native'];raw=urllib.request.urlopen(native['url'],timeout=60).read()
    assert sha(raw)==native['sha256']
    assert 'sha512-'+base64.b64encode(hashlib.sha512(raw).digest()).decode()==native['integrity']
    (out/'native.tgz').write_bytes(raw)
    with tarfile.open(fileobj=io.BytesIO(raw)) as t:
        assert len(t.getnames())==len(set(t.getnames()))
        assert all(m.name.startswith('package/') and '..' not in Path(m.name).parts and (m.isfile() or m.isdir()) for m in t.getmembers())
        binary=t.extractfile('package/bin/rg').read();license=t.extractfile('package/LICENSE').read()
    assert sha(binary)==native['binarySha256']
    assert sha(license)==lock['nativeLicenseSha256']
    dest=stage/native['binaryPath'];dest.parent.mkdir(parents=True);dest.write_bytes(binary);dest.chmod(0o755)
    (stage/'licenses').mkdir();(stage/'licenses/vscode-ripgrep-native-LICENSE').write_bytes(license)
    ripgrepLicense=port/'electron-oh/RIPGREP-LICENSE-MIT';assert sha(ripgrepLicense.read_bytes())==lock['ripgrepLicense']['sha256']
    shutil.copyfile(ripgrepLicense,stage/'licenses/ripgrep-LICENSE-MIT')
    notice=port/'electron-oh/THIRD_PARTY_NOTICES.md';assert sha(notice.read_bytes())==lock['noticesSha256']
    shutil.copyfile(notice,stage/'THIRD_PARTY_NOTICES.md')
    meta = json.loads((stage / 'package.json').read_text())
    assert all(meta[k] == lock['candidate'][k] for k in ['name','version'])
    assert meta['repository'] == lock['repository']
    buf = io.BytesIO(); inventory = {}
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT) as t:
        for f in sorted(stage.rglob('*')):
            if not f.is_file(): continue
            rel = f.relative_to(stage).as_posix(); content = f.read_bytes()
            info = tarfile.TarInfo('package/' + rel)
            info.size = len(content); info.mode = 0o755 if rel == native['binaryPath'] else 0o644; info.uid = info.gid = 0
            info.mtime = 0; info.uname = info.gname = ''
            t.addfile(info, io.BytesIO(content)); inventory[rel] = sha(content)
    tarbytes = gzip.compress(buf.getvalue(), compresslevel=9, mtime=0)
    # Canonical OS marker so Python/zlib platform differences do not change gzip headers.
    tarbytes = tarbytes[:9] + b'\xff' + tarbytes[10:]
    (out / 'candidate.tgz').write_bytes(tarbytes)
    receipt = {'name': meta['name'], 'version': meta['version'], 'sha256': sha(tarbytes),
               'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(tarbytes).digest()).decode(),
               'files': inventory, 'baselineSha256': sha(data)}
    (out / 'manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({k:v for k,v in receipt.items() if k != 'files'},indent=2))

if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    args=p.parse_args();build(args.port.resolve(),args.output.resolve())
