#!/usr/bin/env python3
"""Build the locked Canvas 1.0.2 + Skia + AVIF + source shim for Electron-OH.

Outputs are new files. No prebuilt canvas/Skia/shim binary is accepted as input.
SPDX-License-Identifier: MIT
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def unpack(archive, output, strip=0):
    output.mkdir(parents=True, exist_ok=True)
    links = []
    seen = set()
    with tarfile.open(archive) as tar:
        for member in tar:
            p = PurePosixPath(member.name)
            require(not p.is_absolute() and '..' not in p.parts and '\\' not in member.name, 'unsafe source archive path')
            if len(p.parts) <= strip:
                continue
            rel = PurePosixPath(*p.parts[strip:])
            require(rel.as_posix() not in seen, 'duplicate source archive path')
            seen.add(rel.as_posix())
            target = output.joinpath(*rel.parts)
            require(output.resolve() in target.resolve().parents, 'source path escapes output')
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as src, target.open('wb') as dest:
                    shutil.copyfileobj(src, dest)
                target.chmod(member.mode & 0o777)
            elif member.issym():
                require(not Path(member.linkname).is_absolute(), 'absolute source symlink')
                require(output.resolve() in (target.parent / member.linkname).resolve().parents, 'source symlink escapes output')
                links.append((target, member.linkname))
            else:
                raise ValueError('unsupported source archive member: ' + member.name)
    # File writes never follow source-supplied symlinks.
    for path, name in links:
        require(not path.exists() and not path.is_symlink(), 'source symlink collision')
        path.symlink_to(name)


def download(url, target, expected):
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        part = target.with_suffix(target.suffix + '.part')
        with urllib.request.urlopen(url, timeout=90) as response, part.open('wb') as dest:
            require(response.geturl().startswith('https://'), 'source HTTPS downgrade')
            shutil.copyfileobj(response, dest)
        require(sha(part) == expected, 'download checksum mismatch: ' + target.name)
        part.rename(target)
    require(sha(target) == expected, 'cached input checksum mismatch: ' + target.name)


def run(command, cwd, log, env=None):
    print('Running:', log.name, flush=True)
    with log.open('w') as output:
        result = subprocess.run([str(v) for v in command], cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT)
    require(result.returncode == 0, 'command failed; retained log: ' + str(log))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ndk', type=Path, required=True, help='Exact supported OHOS native SDK')
    p.add_argument('--gn', type=Path, required=True, help='Pinned GN host executable')
    p.add_argument('--cache', type=Path, required=True, help='Source archive cache; downloads verified by locks')
    p.add_argument('--output', type=Path, required=True, help='New build directory outside recipe/cache')
    p.add_argument('--jobs', type=int, default=6)
    p.add_argument('--local-git-root', type=Path, help='Optional read-only Skia dependency Git cache')
    args = p.parse_args()
    lock = read(ROOT / 'source-inputs.lock.json')
    deps = read(ROOT / 'skia-dependencies.lock.json')
    require(platform.system().lower() == lock['host']['os'] and platform.machine() == lock['host']['arch'], 'this locked toolchain currently supports macOS arm64 hosts')
    ndk, gn, cache, out = [x.resolve() for x in (args.ndk, args.gn, args.cache, args.output)]
    require(args.jobs > 0 and args.jobs <= 32, 'invalid jobs')
    require(not out.exists() and ROOT not in out.parents and cache != out and cache not in out.parents, 'use a new build directory outside recipe and input cache')
    require(sha(gn) == lock['gn']['sha256'], 'GN executable mismatch')
    require(sha((ndk / 'llvm/bin/clang').resolve()) == lock['ndk']['compilerSha256'], 'NDK compiler mismatch')
    for name, expected in lock['ndk'].get('supportFiles', {}).items():
        require(sha(ndk / name) == expected, 'NDK runtime/header mismatch: ' + name)
    require(subprocess.check_output(['rustc', '+1.99.1', '--version'], text=True).strip() == lock['rust']['version'], 'Rust compiler mismatch')
    for path, expected in [('Cargo.lock', lock['rust']['cargoLockSha256']), ('skia-args.gn.in', lock['skiaArgsTemplateSha256']), ('ohos-deps.toolchain.cmake', lock['cargoCmakeToolchainSha256']), ('skia-dependencies.lock.json', lock['dependencyLockSha256']), (lock['shim']['generator'], lock['shim']['generatorSha256']), (lock['shim']['source'], lock['shim']['sha256'])]:
        require(sha(ROOT / path) == expected, 'recipe input mismatch: ' + path)
    for patch in lock['nativeSourcePatches']:
        require(sha(ROOT / patch['path']) == patch['sha256'], 'source patch checksum mismatch')
    out.mkdir(parents=True)
    logs = out / 'logs'; logs.mkdir()
    cache.mkdir(parents=True, exist_ok=True)
    source = out / 'source'
    for name, strip in [('canvas', 1), ('skia', 1)]:
        item = lock[name]
        archive = cache / (name + '-source.tar.gz')
        download(item['url'], archive, item['sha256'])
        unpack(archive, source if name == 'canvas' else source / 'skia', strip)
    dep_cache = cache / 'dependency-archives'; dep_cache.mkdir(exist_ok=True)
    for dep in deps:
        name = dep['path'].split('/')[-1]
        archive = dep_cache / (name + '.tar')
        if not archive.exists():
            gitdir = cache / 'dependency-git' / name
            candidate = args.local_git_root / dep['path'] if args.local_git_root else None
            if candidate and subprocess.run(['git', '-C', str(candidate), 'cat-file', '-e', dep['commit']], capture_output=True).returncode == 0:
                gitdir = candidate
            else:
                gitdir.mkdir(parents=True, exist_ok=True)
                subprocess.run(['git', '-C', str(gitdir), 'init', '--quiet'], check=True)
                run(['git', '-C', gitdir, 'fetch', '--depth', '1', dep['url'], dep['commit']], out, logs / ('fetch-' + name + '.log'))
            with archive.open('wb') as dest:
                subprocess.run(['git', '-C', str(gitdir), 'archive', '--format=tar', dep['commit']], stdout=dest, check=True)
        require(sha(archive) == dep['archiveSha256'], 'dependency archive mismatch: ' + name)
        unpack(archive, source / 'skia' / dep['path'])
    for i, patch in enumerate(lock['nativeSourcePatches']):
        cwd = source if patch['domain'] == 'canvas' else source / 'skia'
        run(['patch', '--fuzz=0', '-p1', '-i', ROOT / patch['path']], cwd, logs / ('patch-' + str(i + 1) + '.log'))
    shutil.copy2(ROOT / 'Cargo.lock', source / 'Cargo.lock')
    generated = out / 'canvas_electron_shim.c'
    run([sys.executable, ROOT / 'tools/generate-shim.py', '--ndk', ndk, '--output', generated], out, logs / 'generate-shim.log')
    require(sha(generated) == lock['shim']['sha256'], 'generated shim differs from reviewed source')
    llvm = ndk / 'llvm/bin'
    run([llvm / 'clang', '--target=aarch64-linux-ohos', '--sysroot=' + str(ndk / 'sysroot'), '-std=c11', '-O2', '-fPIC', '-fvisibility=hidden', '-I' + str(ROOT / 'shim/include/electron_node/src'), '-c', generated, '-o', out / 'shim.o'], out, logs / 'shim-compile.log')
    run([llvm / 'llvm-ar', 'rcs', out / 'libcanvas_electron_shim.a', out / 'shim.o'], out, logs / 'shim-archive.log')
    skia_out = source / 'skia/out/OHOS'; skia_out.mkdir(parents=True)
    # Skia's static archive merger invokes bin/gn even when gen used an explicit path.
    (source / 'skia/bin/gn').symlink_to(gn)
    (skia_out / 'args.gn').write_text((ROOT / 'skia-args.gn.in').read_text().replace('@NDK@', str(ndk)))
    run([gn, 'gen', skia_out], source / 'skia', logs / 'gn.log')
    run(['ninja', '-C', skia_out, '-j', str(args.jobs)], out, logs / 'ninja.log')
    env = dict(os.environ)
    env.update({'CANVAS_OHOS_NDK': str(ndk), 'CANVAS_ELECTRON_SHIM_DIR': str(out), 'OHOS_NDK_HOME': str(ndk.parent),
                'CC': str(llvm / 'aarch64-unknown-linux-ohos-clang'), 'CXX': str(llvm / 'aarch64-unknown-linux-ohos-clang++'), 'AR': str(llvm / 'llvm-ar'),
                'CMAKE_TOOLCHAIN_FILE': str(ROOT / 'ohos-deps.toolchain.cmake'), 'CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER': str(llvm / 'aarch64-unknown-linux-ohos-clang'),
                'SKIA_DIR': str(source / 'skia'), 'SKIA_LIB_DIR': str(skia_out), 'CFLAGS': '-fPIC -march=armv8-a+crypto+crc', 'CXXFLAGS': '-fPIC -march=armv8-a+crypto+crc'})
    run(['cargo', '+1.99.1', 'build', '--locked', '--release', '--target', 'aarch64-unknown-linux-ohos', '-j', str(min(args.jobs, 3))], source, logs / 'cargo.log', env)
    binary = source / 'target/aarch64-unknown-linux-ohos/release/libcanvas.so'
    dest = out / 'native'; dest.mkdir()
    target = dest / 'skia.electron-oh-arm64.node'; shutil.copy2(binary, target)
    undefined = subprocess.check_output([str(llvm / 'llvm-nm'), '-D', '--undefined-only', str(target)], text=True)
    require(not any(line.split()[-1].startswith(('napi_', 'node_api_', 'uv_', 'avif')) for line in undefined.splitlines() if line.split()), 'unresolved native API/dependency')
    exports = subprocess.check_output([str(llvm / 'llvm-nm'), '-D', '--defined-only', str(target)], text=True)
    require(any(line.split()[-1] == 'napi_register_module_v1' for line in exports.splitlines() if line.split()), 'native registration export missing')
    (dest / 'undefined.txt').write_text(undefined); (dest / 'exports.txt').write_text(exports)
    dynamic = subprocess.check_output([str(llvm / 'llvm-readelf'), '-d', str(target)], text=True)
    (dest / 'dynamic.txt').write_text(dynamic)
    require('libace_napi' not in dynamic and 'libelectron.so' not in dynamic, 'unintended N-API engine dependency')
    # A separate Cargo target directory prevents reusing the Electron link result.
    # Node exports Node-API itself; no Electron shim or libace_napi is linked.
    node_env = dict(env)
    node_env.pop('CANVAS_ELECTRON_SHIM_DIR')
    node_env['CARGO_TARGET_DIR'] = str(out / 'node-target')
    run(['cargo', '+1.99.1', 'build', '--locked', '--release', '--target', 'aarch64-unknown-linux-ohos', '-j', str(min(args.jobs, 3))], source, logs / 'cargo-node.log', node_env)
    node_target = dest / 'skia.openharmony-arm64.node'
    shutil.copy2(out / 'node-target/aarch64-unknown-linux-ohos/release/libcanvas.so', node_target)
    node_dynamic = subprocess.check_output([str(llvm / 'llvm-readelf'), '-d', str(node_target)], text=True)
    require('libace_napi' not in node_dynamic and 'libelectron.so' not in node_dynamic, 'unexpected Node provider dependency')
    (dest / 'node-dynamic.txt').write_text(node_dynamic)
    node_undefined = subprocess.check_output([str(llvm / 'llvm-nm'), '-D', '--undefined-only', str(node_target)], text=True)
    require(any(line.split()[-1].startswith('napi_') for line in node_undefined.splitlines() if line.split()), 'Node host imports missing')
    require(not any(line.split()[-1].startswith('avif') for line in node_undefined.splitlines() if line.split()), 'Node AVIF imports unresolved')
    (dest / 'node-undefined.txt').write_text(node_undefined)
    manifest = {'status': 'built', 'nativeSourceRebuild': True, 'fullCanvasSkiaAvifCompilation': True,
                'officialPrebuiltShimLinked': False, 'shimImplementation': 'header-derived project C source',
                'sourceLockSha256': sha(ROOT / 'source-inputs.lock.json'), 'cargoLockSha256': sha(ROOT / 'Cargo.lock'),
                'shimSourceSha256': sha(generated), 'shimArchiveSha256': sha(out / 'libcanvas_electron_shim.a'),
                'outputs': {p.name: {'sha256': sha(p), 'size': p.stat().st_size} for p in [target, node_target]},
                'skiaArchives': {p.name: sha(p) for p in sorted(skia_out.glob('*.a'))},
                'logs': {p.name: sha(p) for p in sorted(logs.iterdir())},
                'deviceValidation': 'not performed by this build; historical candidate reports do not apply'}
    write(dest / 'native-manifest.json', manifest)
    print(json.dumps({'native': str(target), 'sha256': sha(target), 'nativeSourceRebuild': True}), flush=True)


if __name__ == '__main__':
    main()
