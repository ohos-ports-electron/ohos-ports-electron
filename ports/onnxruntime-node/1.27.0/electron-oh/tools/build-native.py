#!/usr/bin/env python3
"""Build the API-27 Electron core and binding from locked upstream inputs."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import urllib.parse
import urllib.request
import zipfile

ADAPTER = Path(__file__).resolve().parent.parent
PORT = ADAPTER.parent

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def safe_name(name):
    path = PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts
    return '/'.join(path.parts[1:])

def extract_tar(archive, output):
    seen = set()
    with tarfile.open(archive) as source:
        for entry in source:
            name = safe_name(entry.name)
            if not name or entry.isdir():
                continue
            assert name not in seen and entry.isfile(), entry.name
            seen.add(name)
            dest = output / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(source.extractfile(entry).read())
            dest.chmod(entry.mode & 0o755)

def extract_zip(archive, output):
    seen = set()
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            name = safe_name(entry.filename)
            if not name or entry.is_dir():
                continue
            assert name not in seen
            seen.add(name)
            dest = output / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(source.read(entry))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--sdk-native', type=Path, required=True)
    parser.add_argument('--shim-library', type=Path, required=True,
                        help='Official libshim.a matching native-inputs.lock.json; not stored in Git')
    parser.add_argument('--node-addon-api-archive', type=Path)
    parser.add_argument('--check-support-inputs', action='store_true',
                        help='Check/stage support inputs only; does not compile')
    parser.add_argument('--cache-root', type=Path)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=False)
    logs = work / 'logs'
    logs.mkdir()
    lock = json.loads((ADAPTER / 'native-inputs.lock.json').read_text())
    package_lock = json.loads((ADAPTER / 'inputs.lock.json').read_text())
    # Validate external inputs before expensive compilation. Keep the native lock unchanged.
    shim = work / 'electron-napi-library'
    shipped_headers = ADAPTER / 'native/vendor/electron-napi-library'
    for name, expected in lock['shim']['headers'].items():
        assert sha(shipped_headers / name) == expected, 'shim header: ' + name
        destination = shim / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(shipped_headers / name, destination)
    assert sha(args.shim_library) == lock['shim']['sha256'], 'shim library hash mismatch'
    (shim / 'lib').mkdir()
    shutil.copyfile(args.shim_library, shim / 'lib/libshim.a')
    api_source = work / 'node-addon-api.tgz'
    if args.node_addon_api_archive:
        shutil.copyfile(args.node_addon_api_archive, api_source)
    else:
        with urllib.request.urlopen('https://registry.npmjs.org/node-addon-api/-/node-addon-api-6.1.0.tgz', timeout=60) as response, api_source.open('wb') as stream:
            shutil.copyfileobj(response, stream)
    assert sha(api_source) == lock['nodeAddonApi']['sha256'], 'node-addon-api hash mismatch'
    node_api = work / 'node-addon-api'
    extract_tar(api_source, node_api)
    if args.check_support_inputs:
        print(json.dumps({'status': 'passed', 'scope': 'locked support inputs only', 'nativeCompilation': False}))
        return
    env = os.environ.copy()
    env['OHOS_NDK_HOME'] = str(args.sdk_native.resolve())
    def run(command, name):
        with (logs / (name + '.log')).open('w') as stream:
            subprocess.run(list(map(str, command)), env=env, stdout=stream, stderr=subprocess.STDOUT, check=True)
    def fetch(spec, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        cached = args.cache_root / spec['cachePath'] if args.cache_root else None
        if cached and cached.is_file() and sha(cached) == spec['sha256']:
            shutil.copyfile(cached, dest)
        else:
            url = spec['url']
            if '/archive/' in url and url.startswith('https://github.com/'):
                parts = urllib.parse.urlparse(url).path.strip('/').split('/')
                ref = '/'.join(parts[3:]).removesuffix('.zip')
                if parts[1] == 'eigen':
                    ref = parts[3]
                url = f'https://codeload.github.com/{parts[0]}/{parts[1]}/zip/{ref}'
            with urllib.request.urlopen(url, timeout=180) as response, dest.open('wb') as stream:
                shutil.copyfileobj(response, stream)
        assert sha(dest) == spec['sha256'], spec['url']
    archive = work / 'source.tar.gz'
    fetch(lock['source'], archive)
    source = work / 'source'
    extract_tar(archive, source)
    for name, expected in package_lock['nativeSourcePatches'].items():
        patch = PORT / 'patchs' / name
        assert sha(patch) == expected
        subprocess.run(['patch', '--batch', '--fuzz=0', '-p1', '-i', str(patch)], cwd=source, check=True)
    mirror = work / 'mirror'
    for dep in lock['dependencies']:
        fetch(dep, mirror / dep['url'].removeprefix('https://'))
    protobuf = next(dep for dep in lock['dependencies'] if dep['name'] == 'protobuf')
    host_source = work / 'protobuf-host-source'
    extract_zip(mirror / protobuf['url'].removeprefix('https://'), host_source)
    host_build = work / 'protoc-host'
    run(['cmake', '-S', host_source / 'cmake', '-B', host_build, '-G', 'Ninja',
         '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
         '-Dprotobuf_BUILD_TESTS=OFF', '-Dprotobuf_WITH_ZLIB=OFF', '-DCMAKE_CXX_FLAGS=-w'], 'protoc-configure')
    run(['cmake', '--build', host_build, '--target', 'protoc', '--parallel', args.jobs], 'protoc-build')
    core = work / 'core-build'
    common = ['-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release',
              '-DCMAKE_TOOLCHAIN_FILE=' + str(ADAPTER / 'native/ohos-linux.toolchain.cmake'),
              '-DOHOS_ARCH=arm64-v8a', '-DOHOS_STL=c++_static',
              '-DCMAKE_CXX_FLAGS=-Wno-error=unused-command-line-argument']
    run(['cmake', '-S', source / 'cmake', '-B', core, *common,
         '-DCMAKE_POLICY_VERSION_MINIMUM=3.5', '-DONNX_CUSTOM_PROTOC_EXECUTABLE=' + str(host_build / 'protoc'),
         '-Donnxruntime_CMAKE_DEPS_MIRROR_DIR=' + str(mirror), '-Donnxruntime_BUILD_SHARED_LIB=ON',
         '-Donnxruntime_BUILD_UNIT_TESTS=OFF', '-Donnxruntime_BUILD_BENCHMARKS=OFF',
         '-Donnxruntime_USE_CUDA=OFF', '-Donnxruntime_USE_FULL_PROTOBUF=OFF',
         '-Donnxruntime_CROSS_COMPILING=ON', '-Donnxruntime_USE_VCPKG=OFF', '-Donnxruntime_ENABLE_LTO=OFF',
         '-DCMAKE_C_FLAGS=-Wno-error=unused-command-line-argument',
         '-DCMAKE_ASM_FLAGS=-Wno-error=unused-command-line-argument',
         '-DCMAKE_SHARED_LINKER_FLAGS=-static-libstdc++ -Wl,--exclude-libs,libc++_static.a:libc++abi.a:libunwind.a -Wl,-z,max-page-size=0x1000'], 'core-configure')
    run(['cmake', '--build', core, '--target', 'onnxruntime', '--parallel', args.jobs], 'core-build')
    binding = work / 'binding-build'
    run(['cmake', '-S', ADAPTER / 'native', '-B', binding, *common,
         '-DORT_SOURCE_DIR=' + str(source), '-DORT_CORE_DIR=' + str(core),
         '-DELECTRON_NAPI_DIR=' + str(shim), '-DNODE_ADDON_API_DIR=' + str(node_api)], 'binding-configure')
    run(['cmake', '--build', binding, '--parallel', args.jobs], 'binding-build')
    output = work / 'artifacts'
    subprocess.run(['python3', str(ADAPTER / 'tools/freeze-native.py'), '--core',
                    str(core / 'libonnxruntime.so.1.27.0'), '--binding',
                    str(binding / 'onnxruntime_binding_electron.node'), '--llvm-bin',
                    str(args.sdk_native / 'llvm/bin'), '--output', str(output)], check=True)
    print(output)

if __name__ == '__main__':
    main()
