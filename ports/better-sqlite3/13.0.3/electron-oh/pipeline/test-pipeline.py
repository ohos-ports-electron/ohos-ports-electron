#!/usr/bin/env python3
"""Offline handoff/staging tests. Supply a prepared release for full contract tests."""
import argparse
import base64
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import common
import release

RELEASE = None


class HandoffTests(unittest.TestCase):
    def test_added_changed_missing_files_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = root / "candidate.tgz"
            original.write_bytes(b"locked candidate")
            common.save_handoff(root, "bundle.json", {"phase": "build"})
            for action in ("changed", "missing", "added"):
                with self.subTest(action=action):
                    original.write_bytes(b"locked candidate")
                    if action == "changed":
                        original.write_bytes(b"different candidate")
                    elif action == "missing":
                        original.unlink()
                    else:
                        (root / "unexpected.py").write_text("extra code")
                    with self.assertRaises(ValueError):
                        common.verify_handoff(root, "bundle.json")

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "candidate").write_bytes(b"candidate")
            (root / "link").symlink_to(root / "candidate")
            with self.assertRaises(ValueError):
                common.inventory(root, set())

    def test_stage_tool_versions(self):
        for actual, expected in (("11.11.0", False), ("11.15.0", True), ("12.0.0", True), ("bad", False)):
            self.assertEqual(release.npm_version_at_least(actual, (11, 15, 0)), expected)


@unittest.skipUnless(RELEASE, "supply --release for exact-candidate integration tests")
class StageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / "release"
        common.copy_tree(RELEASE, self.root)
        self.candidate = self.root / "build-bundle/artifacts/candidate.tgz"
        self.integrity = "sha512-" + base64.b64encode(hashlib.sha512(self.candidate.read_bytes()).digest()).decode()

    def invoke(self, lookup, execute=False, npm="11.15.0", node="v22.14.0"):
        with patch.object(release.subprocess, "run", return_value=lookup) as view, \
                patch.object(release.subprocess, "check_output", side_effect=[npm, node]), \
                patch.object(release, "run") as upload, contextlib.redirect_stdout(io.StringIO()) as output:
            release.stage(SimpleNamespace(release=self.root, execute=execute))
            self.assertEqual(view.call_args.args[0][:2], ["npm", "view"])
            return json.loads(output.getvalue()), upload

    def absent(self):
        return subprocess.CompletedProcess([], 1, json.dumps({"error": {"code": "E404"}}), "")

    def test_existing_identical_is_read_only(self):
        result, upload = self.invoke(subprocess.CompletedProcess([], 0, json.dumps(self.integrity), ""), execute=True)
        self.assertEqual(result["status"], "already-published")
        upload.assert_not_called()

    def test_existing_different_bytes_rejected(self):
        with self.assertRaisesRegex(ValueError, "different bytes"):
            self.invoke(subprocess.CompletedProcess([], 0, '"sha512-other"', ""), execute=True)

    def test_auth_and_network_errors_do_not_upload(self):
        for code in ("E401", "E403", "ETIMEDOUT"):
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, "lookup failed"):
                self.invoke(subprocess.CompletedProcess([], 1, json.dumps({"error": {"code": code}}), ""), execute=True)

    def test_default_does_not_upload(self):
        result, upload = self.invoke(self.absent())
        self.assertEqual(result["status"], "checked-no-upload")
        upload.assert_not_called()

    def test_old_toolchain_does_not_upload(self):
        with self.assertRaisesRegex(ValueError, "npm >=11.15.0"):
            self.invoke(self.absent(), execute=True, npm="11.11.0")

    def test_explicit_stage_uses_exact_tarball_and_tag(self):
        result, upload = self.invoke(self.absent(), execute=True)
        self.assertEqual(result["status"], "submitted-pending-maintainer-approval")
        upload.assert_called_once_with("npm", "stage", "publish", str(self.candidate), "--ignore-scripts",
                                       "--access", "public", "--tag", "electron-oh", "--registry", release.REGISTRY)

    def test_tampered_release_rejected_before_registry(self):
        self.candidate.write_bytes(b"changed")
        with patch.object(release.subprocess, "run") as lookup, self.assertRaisesRegex(ValueError, "handoff files changed"):
            release.stage(SimpleNamespace(release=self.root, execute=True))
        lookup.assert_not_called()

    def test_missing_runtime_evidence_blocks_even_with_refreshed_hashes(self):
        bundle = self.root / "build-bundle"
        evidence = bundle / "runtime-evidence.json"
        evidence.write_text("{}\n")
        manifest = common.read_json(bundle / "bundle.json")
        common.save_handoff(bundle, "bundle.json", manifest)
        descriptor = common.read_json(self.root / "release.json")
        descriptor["buildManifestSha256"] = common.sha(bundle / "bundle.json")
        common.save_handoff(self.root, "release.json", descriptor)
        with patch.object(release.subprocess, "run") as lookup, self.assertRaisesRegex(ValueError, "checks blocked staging"):
            release.stage(SimpleNamespace(release=self.root, execute=True))
        lookup.assert_not_called()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path)
    args = parser.parse_args()
    RELEASE = args.release
    # Decorator was evaluated before command-line parsing.
    StageTests.__unittest_skip__ = not bool(RELEASE)
    StageTests.__unittest_skip_why__ = "supply --release for exact-candidate integration tests"
    unittest.main(argv=[__file__], verbosity=2)
