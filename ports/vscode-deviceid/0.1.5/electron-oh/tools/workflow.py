#!/usr/bin/env python3
"""Separate build and release: locked baseline -> one Node / Electron-OH 34+37 artifact."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ELECTRON = Path(__file__).resolve().parents[1]
PORT = ELECTRON.parent
VERSION_ROOT = PORT
REPO = PORT.parents[2]
REGISTRY = 'https://registry.npmjs.org/'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def filemap(root):
    return {str(p.relative_to(root)): sha(p) for p in sorted(Path(root).rglob('*'))
            if p.is_file() and not any(x.startswith('._') or x in ('__pycache__', '.DS_Store') for x in p.parts)}


def freeze(root, name, metadata):
    metadata['files'] = {p: h for p, h in filemap(root).items() if p != name}
    write(root / name, metadata)


def verify(root, name):
    metadata = read(root / name)
    require({p: h for p, h in filemap(root).items() if p != name} == metadata['files'], 'frozen handoff changed')
    return metadata


def package_files(path):
    with tarfile.open(path) as archive:
        return {m.name.removeprefix('package/'): archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}


def compare(baseline, candidate, lock):
    original, updated = package_files(baseline), package_files(candidate)
    allowed = {'package.json', 'dist/index.js', 'dist/storage.js'}
    if '0003-node20-native-uuid-import.patch' in lock['patches']:
        allowed.add('dist/devdeviceid.js')
        require(b'const uuid_1 = await import("uuid");' in updated.get('dist/devdeviceid.js', b''), 'native UUID import missing')
        require(b'require("uuid")' not in updated['dist/devdeviceid.js'], 'Node 20 incompatible UUID require remains')
    changed = sorted(p for p in original if original[p] != updated.get(p))
    require(set(changed) == allowed, 'unexpected original file changes: ' + str(changed))
    require(set(updated) - set(original) == {'scripts/install.cjs', 'README.electron-oh.md', 'electron-oh.json'}, 'unexpected new files')
    meta = json.loads(updated['package.json'])
    require((meta['name'], meta['version']) == (lock['packageName'], lock['packageVersion']), 'wrong target identity')
    old = json.loads(original['package.json'])
    for key in ('dependencies', 'main', 'typings', 'license', 'author'):
        require(meta[key] == old[key], 'Node contract changed: ' + key)
    for key in old['scripts']:
        require(meta['scripts'][key] == old['scripts'][key], 'original script changed')
    require(meta['scripts']['install'] == 'node scripts/install.cjs', 'unsafe install entry')
    require(meta['publishConfig'] == {'registry':REGISTRY, 'access':'public', 'tag':'electron-oh'}, 'wrong publication routing')
    require(meta['repository']['url'] == 'https://github.com/ohos-ports-electron/ohos-ports-electron.git', 'wrong repository')
    return {'status':'passed', 'originalFilesCompared':len(original), 'changedOriginalFiles':changed,
            'unchangedOriginalFiles':len(original)-len(changed), 'packageFiles':{p:hashlib.sha256(v).hexdigest() for p,v in updated.items()}}


def build(args):
    lock = read(ELECTRON / 'inputs.lock.json')
    output = args.output.resolve()
    require(not output.exists(), 'choose a new build output directory')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='vscode-deviceid-build-') as temp:
        root = Path(temp)
        baseline = root / 'baseline.tgz'
        baseline.write_bytes(args.baseline.read_bytes() if args.baseline else urllib.request.urlopen(lock['baseline']['url'], timeout=60).read())
        require(sha(baseline) == lock['baseline']['sha256'], 'baseline checksum mismatch')
        integrity = 'sha512-' + base64.b64encode(hashlib.sha512(baseline.read_bytes()).digest()).decode()
        require(integrity == lock['baseline']['integrity'], 'baseline integrity mismatch')
        source = root / 'package'
        source.mkdir()
        for name, data in package_files(baseline).items():
            require('..' not in Path(name).parts and not Path(name).is_absolute(), 'unsafe package path')
            p = source / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        for name, expected in lock['patches'].items():
            patch = PORT / 'patchs' / name
            require(sha(patch) == expected, 'patch checksum mismatch')
            subprocess.run(['patch', '--batch', '-p1', '-i', str(patch)], cwd=source, check=True)
        (source / 'scripts').mkdir()
        shutil.copyfile(ELECTRON / 'install.cjs', source / 'scripts/install.cjs')
        shutil.copyfile(ELECTRON / 'PACKAGE_README.md', source / 'README.electron-oh.md')
        write(source / 'electron-oh.json', {'packageName':lock['packageName'], 'packageVersion':lock['packageVersion'],
              'baseline':lock['baseline'], 'patches':lock['patches'], 'nativeAddonOnHarmony':False})
        subprocess.run(['npm', 'pack', '--ignore-scripts', '--pack-destination', str(root)], cwd=source, check=True)
        candidates = [p for p in root.glob('*.tgz') if p != baseline]
        require(len(candidates) == 1, 'expected one candidate')
        candidate = candidates[0]
        result = compare(baseline, candidate, lock)
        bundle = root / 'bundle'
        bundle.mkdir()
        shutil.copyfile(baseline, bundle / 'baseline.tgz')
        shutil.copyfile(candidate, bundle / 'candidate.tgz')
        shutil.copytree(PORT / 'patchs', bundle / 'recipe/patchs')
        for name in ('inputs.lock.json', 'install.cjs', 'PACKAGE_README.md'):
            shutil.copyfile(ELECTRON / name, bundle / 'recipe' / name)
        write(bundle / 'comparison.json', result)
        freeze(bundle, 'bundle.json', {'phase':'build', 'packageName':lock['packageName'], 'packageVersion':lock['packageVersion'],
               'candidateSha256':sha(candidate), 'baselineSha256':sha(baseline), 'packageFiles':result['packageFiles'], 'published':False})
        shutil.copytree(bundle, output)
        verify(output, 'bundle.json')
    print(json.dumps({'status':'built', 'bundle':str(output), 'candidateSha256':sha(output/'candidate.tgz'), 'published':False}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--output', type=Path, default=PORT / 'build-workspace')
    build(parser.parse_args())


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
