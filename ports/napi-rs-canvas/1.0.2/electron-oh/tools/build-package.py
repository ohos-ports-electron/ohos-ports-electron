#!/usr/bin/env python3
"""Reconstruct the exact npm package from locked baseline, patches, source native and notices."""
import argparse
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import urllib.request

ADAPTER = Path(__file__).resolve().parents[1]
PORT = ADAPTER.parent

def require(value, message):
    if not value:
        raise ValueError(message)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native-artifacts', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    args = parser.parse_args()
    lock = json.loads((ADAPTER / 'inputs.lock.json').read_text())
    require(subprocess.check_output(['node', '-p', 'process.versions.node'], text=True).strip() == lock['packageToolchain']['node'], 'wrong package-building Node')
    require(subprocess.check_output(['npm', '--version'], text=True).strip() == lock['packageToolchain']['npm'], 'wrong package-building npm')
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    archive = out / 'baseline.tgz'
    if args.baseline:
        shutil.copyfile(args.baseline, archive)
    else:
        with urllib.request.urlopen(lock['baseline']['tarballUrl'], timeout=90) as response:
            archive.write_bytes(response.read(64 * 1024 * 1024 + 1))
    require(sha(archive) == lock['baseline']['sha256'], 'baseline checksum mismatch')
    package = out / 'package'
    package.mkdir()
    with tarfile.open(archive) as source:
        seen = set()
        for item in source.getmembers():
            name = PurePosixPath(item.name)
            require(name.parts and not name.is_absolute() and '..' not in name.parts and '\\' not in item.name and name.parts[0] == 'package', 'unsafe baseline member')
            require(item.name not in seen and (item.isfile() or item.isdir()), 'invalid baseline member')
            seen.add(item.name)
            dest = package.joinpath(*name.parts[1:])
            if item.isfile():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(source.extractfile(item).read())
    for patch in lock['packagePatches']:
        source = PORT / patch['path']
        require(sha(source) == patch['sha256'], 'patch checksum mismatch')
        subprocess.run(['patch', '--fuzz=0', '-p1', '-i', str(source)], cwd=package, check=True)
    native = args.native_artifacts.resolve()
    for name, digest in lock['nativeAdapter']['outputs'].items():
        require(sha(native / name) == digest, 'native checksum mismatch: ' + name)
        dest = package / 'native/electron' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(native / name, dest)
    require(sha(native / 'native-source.json') == lock['nativeReceiptSha256'], 'native receipt mismatch')
    for name, digest in lock['nodeNative']['outputs'].items():
        require(sha(native / name) == digest, 'Node native checksum mismatch: ' + name)
        shutil.copyfile(native / name, package / name)
    shutil.copyfile(native / 'native-source.json', package / 'native-source.json')
    notices = json.loads((ADAPTER / 'licenses.lock.json').read_text())
    for name, digest in notices.items():
        require(sha(ADAPTER / 'licenses' / name) == digest, 'notice mismatch: ' + name)
    shutil.copytree(ADAPTER / 'licenses', package / 'licenses')
    shutil.copyfile(ADAPTER / 'PACKAGE_README.md', package / 'README.md')
    result = subprocess.run(['npm', 'pack', '--json', '--pack-destination', str(out)], cwd=package,
                            capture_output=True, text=True, check=True)
    (out / 'npm-pack.json').write_text(result.stdout)
    tgz = out / json.loads(result.stdout)[0]['filename']
    frozen = out / 'candidate.tgz'
    tgz.rename(frozen)
    files = {}
    with tarfile.open(frozen) as packed:
        for item in packed.getmembers():
            if item.isfile():
                files[item.name[8:]] = hashlib.sha256(packed.extractfile(item).read()).hexdigest()
    require(files['skia.openharmony-arm64.node'] == lock['nodeNative']['outputs']['skia.openharmony-arm64.node'], 'source-built Node addon mismatch')
    identity = json.loads((package / 'package.json').read_text())
    require({k: identity[k] for k in ['name', 'version']} == lock['candidate'], 'package identity mismatch')
    manifest = {'name': identity['name'], 'version': identity['version'], 'sha256': sha(frozen),
                'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(frozen.read_bytes()).digest()).decode(),
                'packageFiles': files, 'nativeSourceRebuild': True}
    if lock.get('candidateSha256'):
        require(manifest['sha256'] == lock['candidateSha256'], 'replayed candidate differs from frozen package')
    write(out / 'candidate.json', manifest)
    print(json.dumps({k: v for k, v in manifest.items() if k != 'packageFiles'}, indent=2))

if __name__ == '__main__':
    main()
