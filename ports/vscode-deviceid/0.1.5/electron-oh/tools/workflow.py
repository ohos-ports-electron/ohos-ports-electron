#!/usr/bin/env python3
"""Separate build and release: locked Node baseline -> exact dual-host npm artifact."""
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


def prepare(args):
    bundle = args.bundle.resolve()
    manifest = verify(bundle, 'bundle.json')
    compare(bundle/'baseline.tgz', bundle/'candidate.tgz', read(bundle/'recipe/inputs.lock.json'))
    require(not args.output.exists(), 'choose a new release output directory')
    reports = {}
    for host, path in (('node', args.node_report), ('electron', args.electron_report)):
        report = read(path / 'verification.json')
        require(report['status'] == 'passed' and report['pass'] == report['total'] == 10 and report['fail'] == 0, host+' runtime failed')
        require(report['packageSha256'] == manifest['candidateSha256'], host+' tested a different candidate')
        require(report['packageName'] == manifest['packageName'] and report['packageVersion'] == manifest['packageVersion'], host+' wrong package')
        require(len(set(report['pids'])) == 2 and report['persistentIdStable'], host+' cold-start evidence missing')
        require(report['signatureVerified'] is True, host+' HAP signature not verified')
        reports[host] = report
    require(reports['node']['versions']['node'] == '24.13.0' and 'electron' not in reports['node']['versions'], 'not standalone Node')
    require(reports['electron']['versions']['electron'] == '37.2.0' and reports['electron']['versions']['node'] == '22.17.0', 'wrong Electron runtime')
    args.output.mkdir(parents=True)
    shutil.copytree(bundle, args.output/'build-bundle')
    recipe = args.output/'ports/vscode-deviceid/0.1.5'
    shutil.copytree(PORT, recipe, ignore=shutil.ignore_patterns('__pycache__', 'node_modules', 'oh_modules', '.hvigor', '.cxx', 'build', '*.hap', '*.hnp', '*.tgz', '._*', 'local.properties'))
    for host, path in (('node', args.node_report), ('electron', args.electron_report)):
        shutil.copytree(path, args.output/'reports'/host)
    freeze(args.output, 'release.json', {'phase':'release', 'packageName':manifest['packageName'], 'packageVersion':manifest['packageVersion'],
           'candidateSha256':manifest['candidateSha256'], 'buildManifestSha256':sha(bundle/'bundle.json'), 'runtimeResults':reports, 'published':False})
    print(json.dumps({'status':'ready', 'release':str(args.output.resolve()), 'published':False}, indent=2))


def publish(args):
    root = args.release.resolve()
    manifest = verify(root, 'release.json')
    build = verify(root/'build-bundle', 'bundle.json')
    require(manifest['candidateSha256'] == sha(root/'build-bundle/candidate.tgz') == build['candidateSha256'], 'candidate changed')
    require(manifest['buildManifestSha256'] == sha(root/'build-bundle/bundle.json'), 'wrong build handoff')
    spec = manifest['packageName']+'@'+manifest['packageVersion']
    candidate = root/'build-bundle/candidate.tgz'
    integrity = 'sha512-'+base64.b64encode(hashlib.sha512(candidate.read_bytes()).digest()).decode()
    check = subprocess.run(['npm','view',spec,'dist.integrity','--json','--registry',REGISTRY], text=True,capture_output=True)
    if check.returncode == 0:
        require(json.loads(check.stdout) == integrity, 'version occupied by different bytes')
        print(json.dumps({'status':'already-published','package':spec,'uploadPerformed':False}));return
    require(json.loads(check.stdout).get('error',{}).get('code') == 'E404', 'registry error; refusing publication')
    command = ['npm','publish',str(candidate),'--ignore-scripts','--access','public','--tag','electron-oh','--registry',REGISTRY]
    if not args.execute:
        print(json.dumps({'status':'checked-no-upload','command':command,'uploadPerformed':False},indent=2));return
    subprocess.run(command, check=True)
    print(json.dumps({'status':'upload-accepted-verify-registry','package':spec,'candidateSha256':sha(candidate)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command',required=True)
    b=commands.add_parser('build');b.add_argument('--baseline',type=Path);b.add_argument('--output',type=Path,default=REPO/'.local/vscode-deviceid/build')
    r=commands.add_parser('prepare');r.add_argument('--bundle',type=Path,required=True);r.add_argument('--node-report',type=Path,required=True);r.add_argument('--electron-report',type=Path,required=True);r.add_argument('--output',type=Path,required=True)
    p=commands.add_parser('publish');p.add_argument('--release',type=Path,required=True);p.add_argument('--execute',action='store_true')
    args=parser.parse_args()
    {'build':build,'prepare':prepare,'publish':publish}[args.command](args)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
