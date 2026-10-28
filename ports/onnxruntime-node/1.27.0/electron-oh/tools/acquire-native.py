#!/usr/bin/env python3
"""Acquire the exact frozen native input without a self-hosted build runner."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import urllib.request

ADAPTER = Path(__file__).resolve().parent.parent


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for data in iter(lambda: stream.read(4194304), b''):
            h.update(data)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Explicit local archive for offline verification')
    parser.add_argument('--url', help='Reviewed immutable HTTPS archive URL')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    lock = json.loads((ADAPTER / 'native-artifact.lock.json').read_text())
    args.output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix='onnx-native-download-', dir=args.output.parent) as temp:
        archive = Path(temp) / 'native.tar.gz'
        if args.archive:
            shutil.copyfile(args.archive, archive)
        else:
            url = args.url or lock['distribution'].get('url')
            if not url or not url.startswith('https://'):
                raise ValueError('Native archive has not been hosted; provide the reviewed HTTPS URL')
            with urllib.request.urlopen(url, timeout=120) as response, archive.open('wb') as stream:
                shutil.copyfileobj(response, stream, 4194304)
        if sha(archive) != lock['archiveSha256']:
            raise ValueError('Native archive checksum mismatch')
        seen = set()
        with tarfile.open(archive) as source:
            for entry in source:
                if not entry.isfile() or entry.name not in lock['files'] or entry.name in seen:
                    raise ValueError('Unexpected or duplicate native archive entry: ' + entry.name)
                seen.add(entry.name)
                target = args.output / entry.name
                with source.extractfile(entry) as src, target.open('wb') as dest:
                    shutil.copyfileobj(src, dest)
                if sha(target) != lock['files'][entry.name]:
                    raise ValueError('Native input checksum mismatch: ' + entry.name)
        if seen != set(lock['files']):
            raise ValueError('Native archive missing required files')
    print(json.dumps({'status': 'passed', 'files': len(seen), 'scope': 'frozen native acquisition; no native compilation'}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
