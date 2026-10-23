#!/usr/bin/env python3
"""Negative regression checks against real baseline/candidate npm tarballs."""
import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile

spec = importlib.util.spec_from_file_location("verify_package", Path(__file__).with_name("verify-package.py"))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def archive(files, dest):
    with tarfile.open(dest, "w:gz") as output:
        for name, content in files.items():
            info = tarfile.TarInfo("package/" + name)
            info.size = len(content)
            output.addfile(info, io.BytesIO(content))


def main(baseline, candidate, package_name):
    with contextlib.redirect_stdout(io.StringIO()):
        verifier.verify(baseline, candidate, package_name)
    original = verifier.read_package(candidate)
    prefix = "prebuilds/electron-oh/37.2.0/openharmony-arm64/"
    cases = {
        "wrong target scope": lambda p: p.update({"package.json": json.dumps({**json.loads(p["package.json"]), "name": "@unexpected/better-sqlite3"}).encode()}),
        "unexpected publish registry": lambda p: p.update({"package.json": json.dumps({**json.loads(p["package.json"]), "publishConfig": {"registry": "https://example.invalid/"}}).encode()}),
        "Node binary overwritten": lambda p: p.update({"prebuilds/openharmony-arm64.node": b"wrong host"}),
        "Node loader modified": lambda p: p.update({"lib/binding.js": b"require('electron')"}),
        "Electron binary missing": lambda p: p.pop(prefix + "better_sqlite3.node"),
        "Electron hash mismatch": lambda p: p.update({prefix + "better_sqlite3.node": p[prefix + "better_sqlite3.node"] + b"tampered"}),
        "license text modified": lambda p: p.update({prefix + "THIRD_PARTY_NOTICES.txt": b"MIT"}),
        "unexpected runtime bundled": lambda p: p.update({"libelectron.so": b"runtime"}),
        "entrypoint changed": lambda p: p.update({"package.json": json.dumps({**json.loads(p["package.json"]), "main": "./electron.js"}).encode()}),
    }
    with tempfile.TemporaryDirectory() as temp:
        for title, mutate in cases.items():
            files = original.copy()
            mutate(files)
            altered = Path(temp) / "altered.tgz"
            archive(files, altered)
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    verifier.verify(baseline, altered, package_name)
            except (AssertionError, KeyError):
                print("PASS: rejects " + title)
            else:
                raise AssertionError("failed to reject " + title)
    print("PASS: real candidate plus nine incompatible/tampered packages")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--package-name", default="@ohos-ports/better-sqlite3")
    args = parser.parse_args()
    main(args.baseline, args.candidate, args.package_name)
