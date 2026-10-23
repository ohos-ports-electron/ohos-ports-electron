#!/usr/bin/env python3
"""Stage 2: frozen bundle -> versioned ports recipe/patch + unchanged npm tgz."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import tempfile

from common import (PORT_PATH, copy_file, copy_tree, install_tree, main_guard,
                    package_check, read_json, release_check, require, run,
                    save_handoff, sha, verify_handoff, write_json)

REGISTRY = "https://registry.npmjs.org/"
TAG = "electron-oh"


def checked_bundle(root):
    manifest = verify_handoff(root, "bundle.json")
    require(manifest["phase"] == "build", "expected a build bundle")
    require(manifest["adapterPath"] == str(Path("adapter") / PORT_PATH / "electron-oh"),
            "unexpected adapter location")
    adapter = root / manifest["adapterPath"]
    baseline, candidate = root / "artifacts/baseline.tgz", root / "artifacts/candidate.tgz"
    require(sha(candidate) == manifest["candidateSha256"], "candidate identity mismatch")
    package_check(adapter, baseline, candidate, manifest["packageName"])
    runtime = read_json(adapter / "electron-oh.lock.json")
    require(runtime["packageVersion"] == manifest["packageVersion"], "version/lock mismatch")
    evidence = root / manifest["runtimeEvidence"] if manifest["runtimeEvidence"] else None
    require(evidence is None or evidence == root / "runtime-evidence.json", "unexpected evidence location")
    preflight = release_check(adapter, baseline, candidate, evidence, manifest["packageName"])
    return manifest, preflight


def overlay_patch(repository, ref, overlay, output):
    require(re.fullmatch(r"[0-9a-f]{40}", ref), "--ports-ref must be an exact 40-character commit SHA")
    archive = subprocess.check_output(["git", "-C", str(repository), "archive", ref])
    with tempfile.TemporaryDirectory(prefix="electron-oh-port-patch-") as temp:
        tree = Path(temp)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(tree, filter="data")
        run("git", "init", "--quiet", tree)
        run("git", "-C", tree, "add", "--all")
        run("git", "-C", tree, "-c", "user.name=Electron OH Recipe", "-c",
            "user.email=recipe@localhost", "-c", "core.hooksPath=/dev/null", "commit",
            "--quiet", "--no-gpg-sign", "-m", "Pinned ports baseline")
        copy_tree(overlay, tree)
        run("git", "-C", tree, "add", "--all")
        changed = subprocess.check_output(["git", "-C", str(tree), "diff", "--cached", "--name-only"]).decode().splitlines()
        allowed = (str(PORT_PATH / "electron-oh") + "/", str(PORT_PATH / "patchs/0003-electron-oh-package.patch"))
        require(changed and all(p.startswith(allowed[0]) or p == allowed[1] for p in changed),
                "upstream patch must only touch electron-oh/ and patch 0003")
        patch = subprocess.check_output(["git", "-C", str(tree), "diff", "--cached", "--binary"])
        output.write_bytes(patch)
        run("git", "-C", tree, "reset", "--hard", "--quiet", "HEAD")
        run("git", "-C", tree, "clean", "-fdq")
        run("git", "-C", tree, "apply", "--check", output)
        return changed


def prepare(args):
    bundle = args.bundle.resolve(strict=True)
    manifest, preflight = checked_bundle(bundle)
    require(not args.output.exists(), "choose a new release output directory")
    require(bundle not in args.output.resolve().parents, "release output must be outside the frozen bundle")
    with tempfile.TemporaryDirectory(prefix="electron-oh-release-") as temp:
        release = Path(temp) / "release"
        release.mkdir()
        copy_tree(bundle, release / "build-bundle")
        adapter = bundle / manifest["adapterPath"]
        overlay = release / "upstream-overlay"
        copy_tree(adapter, overlay / PORT_PATH / "electron-oh")
        copy_file(adapter.parent / "patchs/0003-electron-oh-package.patch",
                  overlay / PORT_PATH / "patchs/0003-electron-oh-package.patch")
        # Own repository has independent entry points. Upstream gets only the overlay;
        # its existing Node build.sh/publish.sh and 0001/0002 remain untouched.
        repository = release / "repository"
        copy_tree(overlay, repository)
        port = repository / PORT_PATH
        (port / "build.sh").write_text('#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")"\nexec "${PYTHON:-python3}" electron-oh/pipeline/build.py --output "${ELECTRON_OH_BUILD_OUTPUT:-$PWD/build-workspace/bundle}" "$@"\n')
        (port / "publish.sh").write_text('#!/usr/bin/env bash\nset -euo pipefail\ncd "$(dirname "$0")"\n: "${ELECTRON_OH_RELEASE_DIR:?Set to a prepared stage-2 release directory}"\nif [[ "${ENABLE_ELECTRON_OH_STAGE:-0}" == 1 ]]; then\n  exec "${PYTHON:-python3}" electron-oh/pipeline/release.py stage --release "$ELECTRON_OH_RELEASE_DIR" --execute\nfi\nexec "${PYTHON:-python3}" electron-oh/pipeline/release.py stage --release "$ELECTRON_OH_RELEASE_DIR"\n')
        (port / "build.sh").chmod(0o755)
        (port / "publish.sh").chmod(0o755)
        (port / ".gitignore").write_text("build-workspace/\n__pycache__/\n._*\n.DS_Store\n")
        write_json(port / "port.json", {
            "packageName": manifest["packageName"], "packageVersion": manifest["packageVersion"],
            "baseline": manifest["baseline"], "candidateSha256": manifest["candidateSha256"],
            "upstreamPortsRepository": "https://github.com/ohos-ports/ohos-ports",
            "upstreamPortsCommit": args.ports_ref, "distTag": TAG, "registry": REGISTRY,
            "publishing": "staged; maintainer approval required",
        })
        patch = release / ("better-sqlite3-" + manifest["packageVersion"] + ".ports.patch")
        changed = overlay_patch(args.ports_repo, args.ports_ref, overlay, patch)
        write_json(release / "release-preflight.json", preflight)
        save_handoff(release, "release.json", {
            "phase": "release", "buildManifestSha256": sha(bundle / "bundle.json"),
            "packageName": manifest["packageName"], "packageVersion": manifest["packageVersion"],
            "candidateSha256": manifest["candidateSha256"], "upstreamPortsCommit": args.ports_ref,
            "upstreamPortsRepository": "https://github.com/ohos-ports/ohos-ports",
            "upstreamPatch": patch.name, "upstreamChangedFiles": changed,
            "releaseReadiness": preflight["status"], "publicationPerformed": False,
        })
        install_tree(release, args.output, "release.json")
    print(json.dumps({"status": "release-materials-prepared", "release": str(args.output.resolve()),
                      "readiness": preflight["status"], "published": False}, indent=2))


def npm_version_at_least(text, required):
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?", text.strip())
    return bool(match and tuple(map(int, match.groups())) >= required)


def stage(args):
    root = args.release.resolve(strict=True)
    release = verify_handoff(root, "release.json")
    require(release["phase"] == "release", "expected a stage-2 release")
    bundle = root / "build-bundle"
    manifest, preflight = checked_bundle(bundle)
    require(sha(bundle / "bundle.json") == release["buildManifestSha256"], "build/release mismatch")
    for key in ("packageName", "packageVersion", "candidateSha256"):
        require(manifest[key] == release[key], "release metadata mismatch: " + key)
    require(preflight["status"] == "ready-for-maintainer-publication",
            "runtime/material/signing checks blocked staging: " + "; ".join(preflight["errors"]))
    candidate = bundle / "artifacts/candidate.tgz"
    spec = manifest["packageName"] + "@" + manifest["packageVersion"]
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(candidate.read_bytes()).digest()).decode()
    lookup = subprocess.run(["npm", "view", spec, "dist.integrity", "--json", "--registry", REGISTRY],
                            text=True, capture_output=True)
    if lookup.returncode == 0:
        require(json.loads(lookup.stdout) == integrity,
                "version already exists with different bytes; build a new locked version")
        print(json.dumps({"status": "already-published", "package": spec, "integrity": integrity,
                          "uploadPerformed": False}, indent=2))
        return
    try:
        error = json.loads(lookup.stdout)["error"]["code"]
    except (ValueError, KeyError, TypeError):
        error = None
    require(error == "E404", "registry lookup failed; only a confirmed E404 permits staging")
    command = ["npm", "stage", "publish", str(candidate), "--ignore-scripts", "--access", "public",
               "--tag", TAG, "--registry", REGISTRY]
    if not args.execute:
        print(json.dumps({"status": "checked-no-upload", "command": shlex.join(command),
                          "next": "Upgrade npm if needed, then add --execute to submit for maintainer approval.",
                          "uploadPerformed": False}, indent=2))
        return
    npm = subprocess.check_output(["npm", "--version"], text=True)
    node = subprocess.check_output(["node", "--version"], text=True)
    require(npm_version_at_least(npm, (11, 15, 0)) and npm_version_at_least(node, (22, 14, 0)),
            "staged publishing requires npm >=11.15.0 and Node >=22.14.0; upgrade the release environment")
    run(*command)
    print(json.dumps({"status": "submitted-pending-maintainer-approval", "package": spec,
                      "candidateSha256": sha(candidate), "publicAvailability": "not-confirmed"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("prepare", help="offline export; never compiles, packs or publishes")
    export.add_argument("--bundle", type=Path, required=True)
    export.add_argument("--ports-repo", type=Path, required=True)
    export.add_argument("--ports-ref", required=True)
    export.add_argument("--output", type=Path, required=True)
    upload = commands.add_parser("stage", help="check a prepared release; upload only with --execute")
    upload.add_argument("--release", type=Path, required=True)
    upload.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    (prepare if args.command == "prepare" else stage)(args)


if __name__ == "__main__":
    main_guard(main)
