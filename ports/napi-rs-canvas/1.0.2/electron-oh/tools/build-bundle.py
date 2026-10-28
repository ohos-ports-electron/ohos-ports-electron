#!/usr/bin/env python3
"""Build once, then bind the frozen package to this checkout and reviewed recipe."""
import argparse
from pathlib import Path
import subprocess
import sys
from release import ADAPTER, check_recipe, git_commit, read, recipe_files, require, sha, verify_candidate, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native-artifacts', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    args = parser.parse_args()
    _, evidence, _ = check_recipe()
    command = [sys.executable, str(ADAPTER / 'tools/build-package.py'),
               '--native-artifacts', str(args.native_artifacts.resolve()), '--output', str(args.output.resolve())]
    if args.baseline:
        command += ['--baseline', str(args.baseline.resolve())]
    subprocess.run(command, check=True)
    out = args.output.resolve()
    verify_candidate(out / 'candidate.tgz')
    native = read(ADAPTER / 'native-artifact.lock.json')
    require(sha(args.native_artifacts / 'native-source.json') == native['members']['native-source.json']['sha256'], 'native receipt mismatch')
    write(out / 'bundle.json', {'schemaVersion': 1, 'gitCommit': git_commit(),
          'candidateSha256': evidence['candidateSha256'], 'candidateManifestSha256': sha(out / 'candidate.json'),
          'nativeArchiveSha256': native['archiveSha256'], 'recipeFiles': recipe_files()})


if __name__ == '__main__':
    main()
