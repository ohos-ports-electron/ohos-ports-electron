#!/usr/bin/env python3
"""Check the shell upload gate using a substitute interpreter; no npm calls."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ENTRY = Path(__file__).resolve().parents[1] / "publish-electron-oh.sh"


class EntryTests(unittest.TestCase):
    def invoke(self, enabled=None, release=True):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            interpreter = root / "python-substitute"
            interpreter.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
            interpreter.chmod(0o755)
            env = dict(os.environ)
            env.pop("ENABLE_ELECTRON_OH_STAGE", None)
            env.pop("ELECTRON_OH_RELEASE_DIR", None)
            env["PYTHON"] = str(interpreter)
            if release:
                env["ELECTRON_OH_RELEASE_DIR"] = str(root / "prepared release")
            if enabled is not None:
                env["ENABLE_ELECTRON_OH_STAGE"] = enabled
            return subprocess.run(["bash", str(ENTRY)], env=env, capture_output=True, text=True)

    def test_default_and_disabled_only_check(self):
        for value in (None, "0", "true"):
            with self.subTest(enabled=value):
                result = self.invoke(value)
                self.assertEqual(result.returncode, 0, result.stderr)
                arguments = result.stdout.splitlines()
                self.assertEqual(arguments[1:3], ["stage", "--release"])
                self.assertNotIn("--execute", arguments)
                self.assertEqual(len(arguments), 4)

    def test_only_explicit_one_enables_stage(self):
        result = self.invoke("1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines()[-1], "--execute")

    def test_missing_release_directory_rejected(self):
        result = self.invoke("1", release=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Set to a prepared stage-2 release directory", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, help="also test the generated recipe's publish.sh")
    args = parser.parse_args()
    if args.entry:
        ENTRY = args.entry.resolve(strict=True)
    unittest.main(argv=[__file__], verbosity=2)
