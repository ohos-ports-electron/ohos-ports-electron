#!/usr/bin/env python3
"""Stage 1: local adaptation + pinned Node package -> immutable build bundle."""
import argparse
import json
from pathlib import Path
import os
import sys
import tarfile
import tempfile
import urllib.request

from common import (BASELINE_NAME, BASELINE_SHA, BASELINE_URL, ELECTRON, PORT_PATH, TARGET,
                    adapter_snapshot, copy_file, copy_tree, install_tree, main_guard,
                    package_check, read_json, release_check, require, run, save_handoff,
                    sha, write_json)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter", type=Path, default=ELECTRON, help="local adapted electron-oh directory")
    parser.add_argument("--baseline", type=Path, help="optional cached pinned Node npm tarball")
    parser.add_argument("--import-candidate", type=Path, help="validate/import an existing candidate; does not compile")
    parser.add_argument("--evidence", type=Path, help="runtime evidence for this exact candidate")
    parser.add_argument("--reports-dir", type=Path, help="optional portable runtime report directory")
    parser.add_argument("--package-name", default=TARGET)
    parser.add_argument("--ndk", type=Path, default=os.environ.get("OHOS_NDK"))
    parser.add_argument("--shim", type=Path, default=os.environ.get("ELECTRON_OH_SHIM"))
    parser.add_argument("--runtime-library", type=Path, default=os.environ.get("ELECTRON_OH_RUNTIME_LIBRARY"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists(), "choose a new build output directory")
    require(args.adapter.resolve() not in args.output.resolve().parents,
            "build output must be outside the adapter source")
    with tempfile.TemporaryDirectory(prefix="electron-oh-build-") as temp:
        work = Path(temp)
        bundle = work / "bundle"
        bundle.mkdir()
        adapter = bundle / "adapter" / PORT_PATH / "electron-oh"
        adapter_snapshot(args.adapter, adapter)
        runtime = read_json(adapter / "electron-oh.lock.json")
        artifact_dir = bundle / "artifacts"
        artifact_dir.mkdir()
        baseline = artifact_dir / "baseline.tgz"
        if args.baseline:
            copy_file(args.baseline, baseline)
        else:
            with urllib.request.urlopen(BASELINE_URL, timeout=60) as reply:
                baseline.write_bytes(reply.read())
        require(sha(baseline) == BASELINE_SHA, "Node baseline checksum mismatch")
        if args.import_candidate:
            candidate = artifact_dir / "candidate.tgz"
            copy_file(args.import_candidate, candidate)
            mode = "imported-validated-candidate"
        else:
            require(args.ndk and args.shim and args.runtime_library,
                    "compile mode requires NDK, shim and matching Electron runtime")
            source = work / "source"
            source.mkdir()
            with tarfile.open(baseline) as archive:
                archive.extractall(source, filter="data")
            source = source / "package"
            run("npm", "install", "--ignore-scripts", "--omit=dev", "--no-save", "--package-lock=false",
                "node-addon-api@" + runtime["nodeAddonApiVersion"], cwd=source)
            output = work / "candidate"
            run(sys.executable, adapter / "tools/electron_oh.py", "--source", source, "--output", output,
                "--package-name", args.package_name, "--ndk", args.ndk, "--shim", args.shim,
                "--runtime-library", args.runtime_library, "--for-hap-distribution")
            run("npm", "pack", "--ignore-scripts", "--pack-destination", artifact_dir, cwd=output)
            candidates = [p for p in artifact_dir.glob("*.tgz") if p != baseline]
            require(len(candidates) == 1, "expected one candidate tarball")
            candidate = artifact_dir / "candidate.tgz"
            candidates[0].rename(candidate)
            mode = "compiled"
        report = package_check(adapter, baseline, candidate, args.package_name)
        write_json(bundle / "package-comparison.json", report)
        run(sys.executable, adapter / "tests/test-package-contract.py", baseline, candidate,
            "--package-name", args.package_name)
        run(sys.executable, adapter / "tests/test-release-guard.py", baseline, candidate,
            "--package-name", args.package_name)
        evidence = None
        if args.evidence:
            evidence = bundle / "runtime-evidence.json"
            copy_file(args.evidence, evidence)
        if args.reports_dir:
            copy_tree(args.reports_dir, bundle / "reports")
        preflight = release_check(adapter, baseline, candidate, evidence, args.package_name)
        write_json(bundle / "release-preflight.json", preflight)
        save_handoff(bundle, "bundle.json", {
            "phase": "build", "mode": mode,
            "packageName": args.package_name, "packageVersion": runtime["packageVersion"],
            "baseline": {"name": BASELINE_NAME, "version": runtime["upstreamVersion"],
                         "url": BASELINE_URL, "sha256": BASELINE_SHA},
            "candidateSha256": sha(candidate), "adapterPath": str(adapter.relative_to(bundle)),
            "runtimeEvidence": "runtime-evidence.json" if evidence else None,
            "releaseReadiness": preflight["status"],
            "publicationPerformed": False,
        })
        install_tree(bundle, args.output, "bundle.json")
        print(json.dumps({"status": "build-bundle-ready", "mode": mode,
                          "bundle": str(args.output.resolve()), "candidateSha256": sha(candidate),
                          "releaseReadiness": preflight["status"], "published": False}, indent=2))


if __name__ == "__main__":
    main_guard(main)
