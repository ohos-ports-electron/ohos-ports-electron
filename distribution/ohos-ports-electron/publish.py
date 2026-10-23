#!/usr/bin/env python3
"""Publish only the exact scoped tarball that passes the release preflight."""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ELECTRON = HERE.parents[1] / "ports/better-sqlite3/13.0.3/electron-oh"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true", help="default is npm publish --dry-run")
    mode.add_argument("--verify-only", action="store_true", help="check accepted upload; never re-upload")
    args = parser.parse_args()
    profile = json.loads((HERE / "profile.json").read_text())
    sys.path.insert(0, str(ELECTRON / "tools"))
    spec = importlib.util.spec_from_file_location("release_check", ELECTRON / "tools/check-release.py")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    result = checker.verify_release(args.baseline, args.package, args.evidence, profile["packageName"])
    print(json.dumps(result, indent=2), flush=True)
    if result["status"] != "ready-for-maintainer-publication":
        return 1
    # Publication is the only mutating registry call, and always uses this profile's scope/tag.
    command = ["npm", "publish", str(args.package.resolve()), "--ignore-scripts", "--access", "public",
               "--tag", profile["distTag"], "--registry", profile["registry"]]
    if not args.execute:
        command.append("--dry-run")
    else:
        subprocess.run(["npm", "whoami", "--registry", profile["registry"]], check=True)
    if not args.verify_only:
        subprocess.run(command, check=True)
    if args.execute or args.verify_only:
        expected = "sha512-" + base64.b64encode(hashlib.sha512(args.package.read_bytes()).digest()).decode()
        # New packages can be accepted before registry reads become available.
        # Retry only reads, never npm publish; --verify-only resumes this step.
        for attempt in range(12):
            query = subprocess.run([
                "npm", "view", profile["packageName"] + "@" + profile["packageVersion"],
                "dist.integrity", "--json", "--registry", profile["registry"]],
                capture_output=True, text=True)
            if query.returncode == 0:
                if json.loads(query.stdout) != expected:
                    raise RuntimeError("Published integrity differs; stop and investigate, do not retry blindly")
                print("Published tarball integrity verified.", flush=True)
                return 0
            error = json.loads(query.stdout).get("error", {})
            if error.get("code") != "E404":
                raise RuntimeError("Registry verification failed: " + str(error.get("code")))
            print("Registry is still processing the package; waiting for read availability.", flush=True)
            if attempt < 11:
                time.sleep(10)
        print("Verification pending. Resume with --verify-only, do not repeat --execute.", flush=True)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
