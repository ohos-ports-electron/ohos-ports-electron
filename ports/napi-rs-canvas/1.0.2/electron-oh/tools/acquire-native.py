#!/usr/bin/env python3
"""Extract only the hash-locked members of the frozen native archive."""
import argparse
import hashlib
import io
from pathlib import Path, PurePosixPath
import tarfile
import tempfile
import urllib.request
from release import ADAPTER, PORT, read, require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--archive', type=Path)
    source.add_argument('--url')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    lock = read(ADAPTER / 'native-artifact.lock.json')
    output = args.output.resolve()
    require(not output.exists() and output != PORT and PORT not in output.parents, 'use a new native directory outside the port')
    if args.archive:
        data = args.archive.read_bytes()
    else:
        url = args.url or lock['archiveUrl']
        require(url and url.startswith('https://'), 'native archive is local-only; provide --archive or a reviewed HTTPS URL')
        with urllib.request.urlopen(url, timeout=90) as response:
            require(response.geturl().startswith('https://'), 'HTTPS downgrade is forbidden')
            data = response.read(64 * 1024 * 1024 + 1)
        require(len(data) <= 64 * 1024 * 1024, 'native archive exceeds size limit')
    require(hashlib.sha256(data).hexdigest() == lock['archiveSha256'], 'native archive checksum mismatch')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='canvas-native-', dir=output.parent) as temporary:
        temporary = Path(temporary)
        seen = set()
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for item in archive:
                path = PurePosixPath(item.name)
                require(path.as_posix() == item.name and len(path.parts) == 1 and item.name in lock['members'], 'unexpected native archive member')
                require(item.isfile() and item.name not in seen, 'non-regular or duplicate native archive member')
                seen.add(item.name)
                expected = lock['members'][item.name]
                require(item.size == expected['size'], 'native size mismatch')
                member = archive.extractfile(item).read()
                require(hashlib.sha256(member).hexdigest() == expected['sha256'], 'native member checksum mismatch')
                (temporary / item.name).write_bytes(member)
        require(seen == set(lock['members']), 'native archive members missing')
        # Rename only after every member has been verified; never unpack arbitrary tar paths.
        staged = temporary / 'verified'
        staged.mkdir()
        for name in seen:
            (temporary / name).rename(staged / name)
        staged.rename(output)
    print('locked native archive and all members: passed')


if __name__ == '__main__':
    main()
