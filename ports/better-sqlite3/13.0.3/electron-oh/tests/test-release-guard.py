#!/usr/bin/env python3
"""Exercise release rejection with real tarballs, without credentials or publishing."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
spec = importlib.util.spec_from_file_location("release_check", ROOT / "tools/check-release.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def check_blocked(result, expected):
    assert result["status"] == "blocked", result
    assert any(expected in error for error in result["errors"]), result


def write_package(files, destination):
    with tarfile.open(destination, "w:gz") as archive:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))


def main(baseline, candidate, package_name):
    check_blocked(checker.verify_release(baseline, candidate, None, package_name), "runtime evidence")
    print("PASS: missing final runtime evidence is rejected")
    with tarfile.open(candidate) as archive:
        files = {item.name: archive.extractfile(item).read()
                 for item in archive.getmembers() if item.isfile()}
    prefix = "package/prebuilds/electron-oh/37.2.0/openharmony-arm64/"
    manifest = json.loads(files[prefix + "manifest.json"])
    with tempfile.TemporaryDirectory() as temp:
        # Accept either a local CI input or a release-ready input: construct the
        # forbidden build mode explicitly rather than assuming the input is local.
        manifest["binary"]["signature"] = "unsigned-local-only"
        files[prefix + "manifest.json"] = json.dumps(manifest).encode()
        local_candidate = Path(temp) / "local-only.tgz"
        write_package(files, local_candidate)
        report = Path(temp) / "claimed-results.json"
        # Deliberately claimed pass results do not override source authorization or build mode.
        report.write_text(json.dumps({
            "candidateSha256": checker.sha(local_candidate), "packageName": package_name,
            "electronBinarySha256": manifest["binary"]["sha256"],
            "baselineSha256": checker.sha(baseline),
            "runtimeResults": {host: {"status": "passed", "reportUrl": "https://example.invalid/report"}
                               for host in ("node", "electronOhHap")},
            "hapSigning": {"codeSignVerified": True, "hapSha256": "0" * 64,
                           "reportUrl": "https://example.invalid/signature"},
            "maintainerReviewUrl": "https://example.invalid/review"}))
        result = checker.verify_release(baseline, local_candidate, report, package_name)
        check_blocked(result, "local test/self-signed")
        print("PASS: claimed passing evidence cannot promote a local-only build")
        policy, _ = checker.load_materials()
        if policy["shimAuthorization"]["status"] != "approved":
            check_blocked(result, "shim redistribution authorization")
            print("PASS: claimed passing evidence cannot supply missing shim authorization")
        # Recompute the notice digest to bypass simple hash consistency checks.
        files[prefix + "THIRD_PARTY_NOTICES.txt"] = b"Incomplete license summary\n"
        manifest["noticesSha256"] = hashlib.sha256(files[prefix + "THIRD_PARTY_NOTICES.txt"]).hexdigest()
        files[prefix + "manifest.json"] = json.dumps(manifest).encode()
        tampered = Path(temp) / "tampered.tgz"
        write_package(files, tampered)
        check_blocked(checker.verify_release(baseline, tampered, None, package_name), "notices do not match")
        print("PASS: replacing full notices is rejected even with a recomputed digest")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--package-name", default="@ohos-ports/better-sqlite3")
    args = parser.parse_args()
    main(args.baseline, args.candidate, args.package_name)
