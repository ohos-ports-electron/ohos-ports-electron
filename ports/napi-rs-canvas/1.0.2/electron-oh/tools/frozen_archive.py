"""Keep the device-tested gzip bytes after independently rebuilding the exact tar."""
import gzip
import hashlib
from pathlib import Path
import urllib.request


def digest(data):
    return hashlib.sha256(data).hexdigest()


def freeze_archive(path, lock):
    path = Path(path)
    replay = path.read_bytes()
    # npm's gzip output can differ between platforms with the same Node/npm.
    # Validate every tar byte, including modes and order, before any fallback.
    if digest(gzip.decompress(replay)) != lock['candidateTarSha256']:
        raise ValueError('reconstructed tar differs from the device-tested package')
    replay_sha = digest(replay)
    if replay_sha == lock['candidateSha256']:
        return {'repackedSha256': replay_sha, 'frozenArchiveDownloaded': False}
    url = lock['candidateArchiveUrl']
    if not url.startswith('https://'):
        raise ValueError('frozen candidate requires HTTPS')
    with urllib.request.urlopen(url, timeout=90) as response:
        if not response.geturl().startswith('https://'):
            raise ValueError('frozen candidate HTTPS downgrade')
        frozen = response.read(64 * 1024 * 1024 + 1)
    if len(frozen) > 64 * 1024 * 1024 or digest(frozen) != lock['candidateSha256']:
        raise ValueError('frozen candidate checksum mismatch')
    if digest(gzip.decompress(frozen)) != lock['candidateTarSha256']:
        raise ValueError('frozen candidate tar mismatch')
    path.rename(path.with_name('repacked.tgz'))
    path.write_bytes(frozen)
    return {'repackedSha256': replay_sha, 'frozenArchiveDownloaded': True}
