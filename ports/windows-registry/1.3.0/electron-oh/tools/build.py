#!/usr/bin/env python3
"""Build deterministic npm bytes for @ohos-ports-electron/windows-registry from the
locked registry baseline (@vscode/windows-registry 1.3.0).

Zero functional patches (patchs/ stays empty): the candidate = the locked baseline tgz
plus distribution metadata (name/version/repository/description/bugs/homepage) and a
port README replacement. The JS distribution (dist/index.js, dist/index.d.ts,
dist/index.js.map) is byte-identical to upstream. The native source (src/winregistry.cc,
binding.gyp) is kept because the upstream npm tarball ships it, but it is never compiled
on OpenHarmony: the platform guard in the JS layer short-circuits for non-win32 and the
addon never loads.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tarfile
import urllib.request


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=90) as r:
        return r.read()


def extract_tgz(data: bytes, dest: Path):
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        names = t.getnames()
        assert len(names) == len(set(names)), "duplicate archive member"
        assert all(n.startswith("package/") and ".." not in Path(n).parts for n in names), "unsafe archive"
        assert all(m.isfile() or m.isdir() for m in t.getmembers()), "non-file member"
        t.extractall(dest, filter="data")


def build(port, out, archive=None, frozen_tgz=None):
    lock = json.loads((port / "electron-oh/inputs.lock.json").read_text(encoding="utf-8"))
    if out.exists():
        raise RuntimeError(f"Output already exists: {out}")
    out.mkdir(parents=True)

    if archive:
        data = Path(archive).read_bytes()
    else:
        data = download(lock["baseline"]["url"])
    assert sha(data) == lock["baseline"]["sha256"], "baseline SHA256 mismatch"
    assert "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode() == lock["baseline"]["integrity"]
    (out / "baseline.tgz").write_bytes(data)
    extract_tgz(data, out / "staging")
    stage = out / "staging/package"

    # README replacement (port readme replaces upstream README; original kept)
    readme = port / "electron-oh/PACKAGE_README.md"
    if lock.get("readmeSha256"):
        assert sha(readme.read_bytes()) == lock["readmeSha256"], "PACKAGE_README SHA256 mismatch"
    shutil.copyfile(stage / "README.md", stage / "README.upstream.md")
    shutil.copyfile(readme, stage / "README.md")

    # metadata rewrite (zero functional patches)
    meta_path = stage / "package.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["name"] = lock["candidate"]["name"]
    meta["version"] = lock["candidate"]["version"]
    meta["description"] = meta["description"] + " (HarmonyOS PC / ohos-ports port of @vscode/windows-registry)"
    meta["repository"] = lock["repository"]
    meta["bugs"] = {"url": "https://github.com/ohos-ports-electron/ohos-ports-electron/issues"}
    meta["homepage"] = "https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/windows-registry/1.3.0"
    with open(meta_path, "w", encoding="utf-8", newline="") as _f:
        _f.write(json.dumps(meta, indent=2) + "\n")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert all(meta[k] == lock["candidate"][k] for k in ["name", "version"])
    assert meta["repository"] == lock["repository"]
    assert not any(k in meta.get("scripts", {}) for k in ["preinstall", "install", "postinstall"]), "unexpected lifecycle script"

    # upstream files kept in the candidate unchanged
    kept = lock.get("library", {}).get("filesSha256", {})
    for rel, expected in kept.items():
        assert sha((stage / rel).read_bytes()) == expected, f"upstream file changed: {rel}"

    # native build inputs removed from the candidate (skip-native-build, B-03).
    # Verify their baseline bytes before removal; they are not part of the candidate.
    removed = lock.get("library", {}).get("removedFromCandidate", {})
    for rel, entry in removed.items():
        assert sha((stage / rel).read_bytes()) == entry["sha256"], f"removed file baseline changed: {rel}"
        (stage / rel).unlink()

    # canonical USTAR tar + gzip(mtime=0, OS marker 0xff); tgz sha256 is the lock target
    def collect_files(base: Path):
        files = []
        for root, dirs, names in os.walk(base):
            dirs.sort()
            for name in sorted(names):
                f = Path(root) / name
                files.append((f.relative_to(base).as_posix(), f))
        return sorted(files, key=lambda x: x[0])

    buf = io.BytesIO()
    inventory = {}
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.USTAR_FORMAT) as t:
        for rel, f in collect_files(stage):
            content = f.read_bytes()
            info = tarfile.TarInfo("package/" + rel)
            info.size = len(content)
            info.mode = 0o644
            info.uid = info.gid = 0
            info.mtime = 0
            info.uname = info.gname = ""
            t.addfile(info, io.BytesIO(content))
            inventory[rel] = sha(content)
    tarbytes = gzip.compress(buf.getvalue(), compresslevel=9, mtime=0)
    tarbytes = tarbytes[:9] + b"\xff" + tarbytes[10:]

    frozen_applied = False
    if lock["candidate"].get("sha256") and sha(tarbytes) != lock["candidate"]["sha256"] and frozen_tgz:
        frozen = Path(frozen_tgz).read_bytes()
        if sha(frozen) != lock["candidate"]["sha256"]:
            raise RuntimeError("frozen candidate checksum mismatch")
        tarbytes = frozen
        frozen_applied = True
    elif lock["candidate"].get("sha256") and sha(tarbytes) != lock["candidate"]["sha256"] and str(lock["candidate"].get("archiveUrl", "")).startswith("https://"):
        frozen = download(lock["candidate"]["archiveUrl"])
        if sha(frozen) != lock["candidate"]["sha256"]:
            raise RuntimeError("frozen candidate archive checksum mismatch")
        tarbytes = frozen
        frozen_applied = True
    (out / "candidate.tgz").write_bytes(tarbytes)
    if frozen_applied:
        with tarfile.open(fileobj=io.BytesIO(tarbytes)) as t:
            inventory = {m.name[8:]: hashlib.sha256(t.extractfile(m).read()).hexdigest() for m in t.getmembers() if m.isfile()}

    receipt = {
        "name": meta["name"],
        "version": meta["version"],
        "sha256": sha(tarbytes),
        "integrity": "sha512-" + base64.b64encode(hashlib.sha512(tarbytes).digest()).decode(),
        "files": inventory,
        "baselineSha256": sha(data),
    }
    (out / "manifest.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({k: v for k, v in receipt.items() if k != "files"}, indent=2))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--archive", type=Path, default=None)
    p.add_argument("--frozen", type=Path, default=None)
    a = p.parse_args()
    build(a.port.resolve(), a.output.resolve(), a.archive, a.frozen)
