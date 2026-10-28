#!/usr/bin/env python3
"""Check the native loading boundaries and freeze version-matched Electron files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ADAPTER = Path(__file__).resolve().parent.parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inspect(path, llvm, output, label):
    def query(tool, *args):
        return subprocess.check_output([str(llvm / tool), *args, str(path)], text=True)
    dynamic = query('llvm-readelf', '-d')
    undefined = query('llvm-nm', '-D', '--undefined-only')
    defined = query('llvm-nm', '-D', '--defined-only')
    for name, value in [('dynamic', dynamic), ('undefined', undefined), ('exports', defined)]:
        (output / (label + '-' + name + '.txt')).write_text(value)
    assert 'libc++_shared.so' not in dynamic, label
    assert not any(len(line.split()) >= 2 and line.split()[-2] == 'U'
                   and line.split()[-1].startswith('_Z') for line in undefined.splitlines()), label
    assert not any(symbol in undefined for symbol in [' napi_', ' node_api_']), label
    exports = {line.split()[-1].split('@')[0] for line in defined.splitlines() if line.split()}
    assert not any(name.startswith('_Z') for name in exports), label
    needed = [line.split('[')[1].split(']')[0] for line in dynamic.splitlines() if '(NEEDED)' in line]
    assert all('/' not in name for name in needed), label
    return {'sha256': sha(path), 'needed': needed, 'exports': sorted(exports)}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--core', type=Path, required=True)
    p.add_argument('--binding', type=Path, required=True)
    p.add_argument('--llvm-bin', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    a.output.mkdir(parents=True, exist_ok=False)
    core = inspect(a.core, a.llvm_bin, a.output, 'core')
    binding = inspect(a.binding, a.llvm_bin, a.output, 'binding')
    assert {'OrtGetApiBase', 'OrtSessionOptionsAppendExecutionProvider_CPU'} <= set(core['exports'])
    if 'napi_register_module_v1' in binding['exports']:
        registration = 'exported napi_register_module_v1'
    else:
        symbols = subprocess.check_output([str(a.llvm_bin / 'llvm-nm'), '--defined-only', str(a.binding)], text=True)
        sections = subprocess.check_output([str(a.llvm_bin / 'llvm-readelf'), '-S', str(a.binding)], text=True)
        assert '_register_onnxruntime' in symbols and 'napi_module_register' in symbols
        assert '.init_array' in sections
        registration = 'constructor registration through local napi_module_register shim'
    assert 'libonnxruntime.so.1' in binding['needed']
    shutil.copyfile(a.core, a.output / 'libonnxruntime.so.1')
    shutil.copyfile(a.binding, a.output / 'onnxruntime_binding_electron.node')
    lock = json.loads((ADAPTER / 'inputs.lock.json').read_text())
    manifest = {'upstreamVersion': '1.27.0', 'ortApiVersion': 27,
                'sourceCommit': '8f0278c77bf44b0cc83c098c6c722b92a36ac4b5',
                'core': core, 'binding': binding, 'cleanupHook': 'retained', 'registration': registration,
                'nativeInputsLockSha256': sha(ADAPTER / 'native-inputs.lock.json'),
                'nativeSourcePatches': lock['nativeSourcePatches'],
                'files': {name: sha(a.output / name) for name in
                          ['libonnxruntime.so.1', 'onnxruntime_binding_electron.node']}}
    (a.output / 'native-artifacts.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    main()
