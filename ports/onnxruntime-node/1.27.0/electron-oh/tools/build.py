#!/usr/bin/env python3
"""Apply package patches and add verified, separately built API-27 Electron files."""
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import urllib.request

ADAPTER = Path(__file__).resolve().parent.parent
PORT = ADAPTER.parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline', type=Path)
    p.add_argument('--native-artifacts', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    out = a.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    lock = json.loads((ADAPTER / 'inputs.lock.json').read_text())
    native_lock = json.loads((ADAPTER / 'native-inputs.lock.json').read_text())
    baseline = out / 'baseline.tgz'
    if a.baseline:
        shutil.copyfile(a.baseline, baseline)
    else:
        baseline.write_bytes(urllib.request.urlopen(lock['baseline']['url'], timeout=180).read())
    assert sha(baseline) == lock['baseline']['sha256']
    assert 'sha512-' + base64.b64encode(hashlib.sha512(baseline.read_bytes()).digest()).decode() == lock['baseline']['integrity']
    package = out / 'package'
    original = {}
    with tarfile.open(baseline) as source:
        for entry in source:
            name = PurePosixPath(entry.name)
            assert not name.is_absolute() and '..' not in name.parts and name.parts[0] == 'package'
            assert entry.isdir() or entry.isfile()
            if not entry.isfile():
                continue
            relative = '/'.join(name.parts[1:])
            assert relative not in original
            dest = package / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(source.extractfile(entry).read())
            dest.chmod(entry.mode & 0o755)
            original[relative] = sha(dest)
    for name, expected in lock['packagePatches'].items():
        patch = PORT / 'patchs' / name
        assert sha(patch) == expected
        subprocess.run(['patch', '--batch', '--fuzz=0', '-p1', '-i', str(patch)], cwd=package, check=True)
    native = json.loads((a.native_artifacts / 'native-artifacts.json').read_text())
    assert native['upstreamVersion'] == '1.27.0' and native['ortApiVersion'] == 27
    assert native['nativeSourcePatches'] == lock['nativeSourcePatches']
    assert native['nativeInputsLockSha256'] == sha(ADAPTER / 'native-inputs.lock.json')
    for name, expected in native['files'].items():
        assert sha(a.native_artifacts / name) == expected
        dest = package / 'bin/electron-oh/napi-v6/arm64' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(a.native_artifacts / name, dest)
    shutil.copyfile(a.native_artifacts / 'native-artifacts.json', package / 'electron-oh-native.json')
    for name, expected in native_lock['licenseFiles'].items():
        assert sha(ADAPTER / 'native/licenses' / name) == expected
        dest = package / 'licenses/electron-oh' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ADAPTER / 'native/licenses' / name, dest)
    meta = json.loads((package / 'package.json').read_text())
    assert all(meta[k] == lock['candidate'][k] for k in ['name', 'version'])
    for name, expected in original.items():
        if name.startswith('bin/'):
            assert sha(package / name) == expected, 'Node/other-platform binary altered: ' + name
    buffer = io.BytesIO()
    files = {}
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as tar:
        for path in sorted(package.rglob('*')):
            if not path.is_file():
                continue
            name = path.relative_to(package).as_posix()
            files[name] = sha(path)
            info = tarfile.TarInfo('package/' + name)
            info.size = path.stat().st_size
            info.mode = 0o644
            info.mtime = 0
            tar.addfile(info, io.BytesIO(path.read_bytes()))
    tgz = out / 'candidate.tgz'
    with tgz.open('wb') as stream:
        with gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as zipped:
            zipped.write(buffer.getvalue())
    result = {'name': meta['name'], 'version': meta['version'], 'sha256': sha(tgz),
              'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(tgz.read_bytes()).digest()).decode(),
              'packageFiles': files, 'nativeArtifacts': native,
              'nodeAndOtherPlatformBinariesUnchanged': True, 'releaseStatus': 'pending-device-validation',
              'changed': sorted(name for name, value in original.items() if files.get(name) != value),
              'added': sorted(set(files) - set(original)), 'removed': sorted(set(original) - set(files))}
    (out / 'candidate.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ['packageFiles', 'nativeArtifacts', 'added']}, indent=2))

if __name__ == '__main__':
    main()
