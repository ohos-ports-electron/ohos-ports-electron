#!/usr/bin/env python3
"""Normal host npm installation, exact file integrity, JS geometry and loader contracts."""
import argparse
import json
from pathlib import Path
import subprocess
from release import ADAPTER, check_recipe, require, sha, verify_candidate, write


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tgz', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    verify_candidate(args.tgz)
    _, evidence, policy = check_recipe()
    output = args.output.resolve()
    require(not output.exists(), 'test output already exists')
    output.mkdir(parents=True)
    write(output / 'package.json', {'name': 'canvas-port-host-check', 'version': '1.0.0', 'private': True})
    command = ['npm', 'install', str(args.tgz.resolve()), '--no-audit', '--no-fund', '--foreground-scripts', '--registry', policy['registry']]
    run = subprocess.run(command, cwd=output, capture_output=True, text=True)
    (output / 'npm-install.log').write_text(run.stdout + run.stderr)
    require(run.returncode == 0, 'normal npm install failed; see npm-install.log')
    package = output / 'node_modules' / policy['packageName']
    for name, expected in evidence['packageFiles'].items():
        require(sha(package / name) == expected, 'installed byte mismatch: ' + name)
    result = subprocess.run(['node', str(ADAPTER / 'tests/host-regression.cjs'), str(package)], capture_output=True, text=True)
    (output / 'host-regression.log').write_text(result.stdout + result.stderr)
    require(result.returncode == 0, 'host JS regression failed; see host-regression.log')
    report = {'status': 'passed', 'candidateSha256': evidence['candidateSha256'],
              'nodeVersion': subprocess.check_output(['node', '-p', 'process.versions.node'], text=True).strip(),
              'npmVersion': subprocess.check_output(['npm', '--version'], text=True).strip(),
              'dependencyLockSha256': sha(output / 'package-lock.json'), 'cases': json.loads(result.stdout),
              'scope': 'normal host install + installed bytes + actual pure JS geometry + simulated loader contracts; no host native Canvas execution or device rerun'}
    write(output / 'host-report.json', report)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
