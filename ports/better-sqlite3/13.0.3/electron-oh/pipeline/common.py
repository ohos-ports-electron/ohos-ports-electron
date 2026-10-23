"""Portable, hashed handoff between build and release. No publication here."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys

ELECTRON = Path(__file__).resolve().parents[1]
PORT = ELECTRON.parent
BASELINE_NAME = "@ohos-ports/better-sqlite3"
BASELINE_URL = "https://registry.npmjs.org/@ohos-ports/better-sqlite3/-/better-sqlite3-13.0.3.tgz"
BASELINE_SHA = "bcd5acef74f8077ba2d803b6297885668088eaa0cb9dc618a2b2a48ffd8aa83c"
TARGET = "@ohos-ports-electron/better-sqlite3"
PORT_PATH = Path("ports/better-sqlite3/13.0.3")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def copy_file(source, destination):
    # macOS/exFAT fast-copy has produced zero-filled test ELF files in this pilot.
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = Path(source).read_bytes()
    destination.write_bytes(data)
    destination.chmod(0o755 if destination.suffix == ".sh" else 0o644)
    require(destination.read_bytes() == data, "copy changed bytes: " + str(destination))


def files(root):
    for path in sorted(Path(root).rglob("*")):
        if any(p.startswith("._") or p in ("__pycache__", ".DS_Store")
               for p in path.relative_to(root).parts):
            continue
        require(not path.is_symlink(), "symlinks are not supported in frozen handoffs")
        if path.is_file():
            yield path


def copy_tree(source, destination):
    require(Path(source).is_dir(), "source directory missing: " + str(source))
    for path in files(source):
        copy_file(path, Path(destination) / path.relative_to(source))


def inventory(root, excluded):
    return {str(p.relative_to(root)): sha(p) for p in files(root)
            if str(p.relative_to(root)) not in excluded}


def verify_handoff(root, manifest_name):
    root = Path(root).resolve(strict=True)
    manifest = read_json(root / manifest_name)
    require(manifest["schemaVersion"] == 1, "unsupported handoff schema")
    require(inventory(root, {manifest_name}) == manifest["files"],
            "handoff files changed, are missing, or contain unexpected additions")
    return manifest


def save_handoff(root, manifest_name, manifest):
    manifest["schemaVersion"] = 1
    manifest["files"] = inventory(root, {manifest_name})
    write_json(Path(root) / manifest_name, manifest)


def install_tree(staging, output, manifest_name):
    output = Path(output).resolve()
    require(not output.exists(), "output already exists: " + str(output))
    copy_tree(staging, output)
    verify_handoff(output, manifest_name)


def adapter_snapshot(source, destination):
    source = Path(source).resolve(strict=True)
    for directory in ("tools", "tests", "licenses", "examples", "pipeline"):
        copy_tree(source / directory, destination / directory)
    for name in ("README.md", "ORGANIZATION.md", "RELEASE.md", "electron-oh.lock.json", "node-api-headers.lock.json",
                 "release-materials.lock.json", "release-evidence.example.json", "build-electron-oh.sh", "publish-electron-oh.sh", ".gitignore"):
        copy_file(source / name, destination / name)
    copy_file(source.parent / "patchs/0003-electron-oh-package.patch",
              destination.parent / "patchs/0003-electron-oh-package.patch")


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def package_check(adapter, baseline, candidate, name):
    checker = module(Path(adapter) / "tests/verify-package.py", "pipeline_package_check")
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        checker.verify(baseline, candidate, name)
    return json.loads(output.getvalue())


def release_check(adapter, baseline, candidate, evidence, name):
    tool_path = str(Path(adapter) / "tools")
    sys.path.insert(0, tool_path)
    # A process must use one frozen adapter, never an earlier import's policy.
    sys.modules.pop("release_materials", None)
    try:
        checker = module(Path(adapter) / "tools/check-release.py", "pipeline_release_check")
        return checker.verify_release(baseline, candidate, evidence, name)
    finally:
        sys.path.remove(tool_path)
        sys.modules.pop("release_materials", None)


def run(*command, cwd=None):
    subprocess.run([str(x) for x in command], cwd=cwd, check=True)


def main_guard(function):
    if sys.version_info < (3, 12):
        sys.exit("Electron OH pipeline requires Python >=3.12; select a supported Python interpreter.")
    try:
        function()
    except (ValueError, OSError, KeyError, AssertionError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
