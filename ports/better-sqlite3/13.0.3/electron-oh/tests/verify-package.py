#!/usr/bin/env python3
"""Compare the actual npm tarballs, including every original Node loader."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tarfile


def read_package(path):
    with tarfile.open(path, "r:gz") as archive:
        return {item.name.removeprefix("package/"): archive.extractfile(item).read()
                for item in archive.getmembers() if item.isfile()}


def verify(baseline, candidate, package_name="@ohos-ports/better-sqlite3"):
    original, updated = read_package(baseline), read_package(candidate)
    # No original file is allowed to change or disappear except package metadata.
    for name, content in original.items():
        if name != "package.json":
            assert updated.get(name) == content, "original package file changed/missing: " + name
    old, new = json.loads(original["package.json"]), json.loads(updated["package.json"])
    assert old["name"] == "@ohos-ports/better-sqlite3" and old["version"] == "13.0.3"
    assert new["name"] == package_name, "unexpected target package name"
    if package_name != old["name"]:
        assert new.pop("publishConfig") == {
            "registry": "https://registry.npmjs.org/", "access": "public", "tag": "electron-oh"}
        new["name"] = old["name"]
    lock = json.loads((Path(__file__).resolve().parents[1] / "electron-oh.lock.json").read_text())
    assert new["version"] == lock["packageVersion"], "candidate does not match the locked Electron revision"
    new["version"] = old["version"]
    new["files"].remove("README.electron-oh.md")
    assert old == new, "unexpected package metadata change"
    prefix = "prebuilds/electron-oh/37.2.0/openharmony-arm64/"
    manifest = json.loads(updated[prefix + "manifest.json"])
    if package_name != old["name"]:
        assert manifest["packageName"] == package_name
        assert manifest["baselinePackageName"] == old["name"]
    binary = updated[prefix + "better_sqlite3.node"]
    assert binary[:4] == b"\x7fELF"
    assert binary[18:20] == b"\xb7\x00", "expected AArch64 ELF"
    assert hashlib.sha256(binary).hexdigest() == manifest["binary"]["sha256"]
    assert hashlib.sha256(updated[prefix + "THIRD_PARTY_NOTICES.txt"]).hexdigest() == \
        manifest["noticesSha256"], "notice text checksum mismatch"
    assert manifest["nodeCompatibility"]["unchangedFiles"]["prebuilds/openharmony-arm64.node"] == \
        hashlib.sha256(original["prebuilds/openharmony-arm64.node"]).hexdigest()
    assert updated["README.electron-oh.md"]
    allowed = {"README.electron-oh.md", prefix + "manifest.json", prefix + "better_sqlite3.node",
               prefix + "THIRD_PARTY_NOTICES.txt"}
    assert set(updated) - set(original) == allowed, "unexpected new package files"
    print(json.dumps({"status": "passed", "originalFilesCompared": len(original),
                      "addedFiles": sorted(allowed), "electronBinarySha256": manifest["binary"]["sha256"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--package-name", default="@ohos-ports/better-sqlite3")
    args = parser.parse_args()
    verify(args.baseline, args.candidate, args.package_name)
