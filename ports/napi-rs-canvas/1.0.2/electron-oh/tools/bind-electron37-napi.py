#!/usr/bin/env python3
"""Bind Electron's own N-API relocations locally, without changing Ark callers.

This is a project-local workaround for the verified Electron-OH 37.2.0 binary.
It does not modify the shared SDK, code instructions, or public symbol exports.
Re-sign the containing HAP after applying it. Never patch an installed library.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ORIGINAL_SHA256 = '8f865ffdd4eacea87da938f1676ffbb653fc1746120bbb43e06bb46b40576541'
PATCHED_SHA256 = '3cedf0ad56ed0173116212d90dab96743f6074964fbcb80ff3ec2cb28726e816'
RELATIVE = 1027


def bind(data):
    original = hashlib.sha256(data).hexdigest()
    if original != ORIGINAL_SHA256:
        raise ValueError('Unrecognized Electron binary: ' + original)
    if data[:6] != b'\x7fELF\x02\x01':
        raise ValueError('Expected little-endian ELF64')
    kind, machine = struct.unpack_from('<HH', data, 16)
    if (kind, machine) != (3, 183):
        raise ValueError('Expected AArch64 ET_DYN')
    shoff = struct.unpack_from('<Q', data, 40)[0]
    stride, count, names_index = struct.unpack_from('<HHH', data, 58)
    sections = [struct.unpack_from('<IIQQQQIIQQ', data, shoff + i * stride)
                for i in range(count)]
    names = sections[names_index]
    section_names = data[names[4]:names[4] + names[5]]
    result = bytearray(data)
    changes = []
    for section in sections:
        if section[1] != 4:  # SHT_RELA
            continue
        symbols = sections[section[6]]
        if symbols[1] != 11:  # SHT_DYNSYM
            continue
        strings = sections[symbols[6]]
        strings = data[strings[4]:strings[4] + strings[5]]
        section_name = section_names[section[0]:].split(b'\0', 1)[0].decode()
        for position in range(section[4], section[4] + section[5], section[9]):
            address, info, addend = struct.unpack_from('<QQq', data, position)
            symbol_index, relocation_type = info >> 32, info & 0xffffffff
            if not symbol_index:
                continue
            offset = symbols[4] + symbol_index * symbols[9]
            name_offset, symbol_info, visibility, defined, value, size = struct.unpack_from('<IBBHQQ', data, offset)
            name = strings[name_offset:].split(b'\0', 1)[0].decode()
            if not name.startswith(('napi_', 'node_api_')) or not defined:
                continue
            if symbol_info & 15 != 2:
                raise ValueError('Expected a function: ' + name)
            if relocation_type not in (257, 1025, 1026):  # ABS64 / GLOB_DAT / JUMP_SLOT
                raise ValueError('Unexpected relocation type for ' + name)
            # Bypass process-wide symbol lookup for this module's own reference.
            # The loader still applies ASLR: address = load_bias + symbol + addend.
            struct.pack_into('<QQq', result, position, address, RELATIVE, value + addend)
            changes.append({'symbol': name, 'section': section_name,
                            'relocation_offset': position, 'target_address': hex(address),
                            'original_type': relocation_type, 'local_value': hex(value + addend)})
    if not any(c['symbol'] == 'napi_define_properties' and c['target_address'] == '0xa86ed18'
               for c in changes):
        raise ValueError('Verified failing relocation was not found')
    # Guard that only the two relocation fields changed; code/exports stay exact.
    allowed = {i for c in changes for i in range(c['relocation_offset'] + 8, c['relocation_offset'] + 24)}
    if any(a != b and i not in allowed for i, (a, b) in enumerate(zip(data, result))):
        raise ValueError('Unexpected change outside relocation records')
    return bytes(result), {'original_sha256': original,
                           'patched_sha256': hashlib.sha256(result).hexdigest(),
                           'electron_version': '37.2.0', 'changes': changes,
                           'strategy': 'module-local RELATIVE relocations for internally defined N-API functions',
                           'pipeline_started': False}


def main():
    workspace = Path(__file__).resolve().parents[1]
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', type=Path, help='Original libelectron.so; defaults to the current main demo HAP')
    p.add_argument('--out-dir', type=Path, default=workspace / 'build/electron-napi-local')
    args = p.parse_args()
    if args.input:
        data = args.input.read_bytes()
    else:
        with zipfile.ZipFile(workspace / 'harmony-demo-electron/dist/app/current-signed.hap') as z:
            data = z.read('libs/arm64-v8a/libelectron.so')
        if hashlib.sha256(data).hexdigest() == PATCHED_SHA256:
            data = (workspace / 'build/electron-napi-local/rollback' / ORIGINAL_SHA256).read_bytes()
    patched, manifest = bind(data)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    backup = args.out_dir / 'rollback' / ORIGINAL_SHA256
    backup.parent.mkdir(exist_ok=True)
    if not backup.exists():
        backup.write_bytes(data)
    (args.out_dir / 'libelectron.so').write_bytes(patched)
    (args.out_dir / 'binding-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'changes'}, indent=2))
    print('Locally bound N-API relocations:', len(manifest['changes']))


if __name__ == '__main__':
    main()
