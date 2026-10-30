#!/usr/bin/env python3
"""Ordinary install, real functional checks and release guard regressions for node-gyp-build."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.error
from unittest.mock import patch

ELECTRON = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ELECTRON / 'tools'))
import release

def rejected(operation):
    try:
        operation()
    except (ValueError, urllib.error.HTTPError):
        return
    raise AssertionError('unsafe release accepted')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, required=True)
    args = parser.parse_args()
    bundle = args.bundle.resolve()
    meta = release.validate(bundle)
    with tempfile.TemporaryDirectory(prefix='ngb-contract-') as temp:
        root = Path(temp)
        (root / 'package.json').write_text(json.dumps({'name': 'host-contract', 'version': '1.0.0', 'private': True,
            'dependencies': {meta['packageName']: 'file:./candidate.tgz'}}))
        shutil.copyfile(bundle / 'candidate.tgz', root / 'candidate.tgz')
        NPM = ['npm.cmd'] if os.name == 'nt' else ['npm']
        subprocess.run(NPM + ['install', '--no-audit', '--no-fund'], cwd=root, check=True)
        suite_path = (ELECTRON / 'tools' / 'suite.cjs').as_posix()
        runner = ("const fn=require('" + suite_path + "');fn().then(r=>{console.log(JSON.stringify(r));if(r.fail)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});")
        (root / 'run.cjs').write_text(runner)
        results = []
        node_env = {**os.environ, 'NODE_PATH': str(root / 'node_modules')}
        for _ in range(2):
            r = json.loads(subprocess.check_output(['node', str(root / 'run.cjs')], cwd=root, text=True, encoding='utf-8', errors='replace', env=node_env))
            assert r['pass'] == r['total'] and r['fail'] == 0, 'host contract failed: ' + json.dumps(r)[:200]
            results.append(r)
        assert results[0]['total'] == results[1]['total'] and results[0]['total'] >= 6
        print('PASS ordinary npm install; host-contract checks twice (separate processes); HarmonyOS 6/6 x2 per role in release-evidence')
    original = json.loads((ELECTRON / 'release-evidence.json').read_text(encoding='utf-8'))
    bad = json.loads(json.dumps(original)); bad['candidateSha256'] = '0' * 64
    native_read = release.read
    with patch.object(release, 'read', side_effect=lambda p: bad if p.name == 'release-evidence.json' else native_read(p)):
        rejected(lambda: release.validate(bundle))
    tamper = Path(tempfile.mkdtemp(prefix='ngb-tamper-'))
    shutil.copytree(bundle, tamper, dirs_exist_ok=True)
    (tamper / 'candidate.tgz').write_bytes(b'changed')
    rejected(lambda: release.validate(tamper))
    good = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': release.REPOSITORY, 'GITHUB_EVENT_NAME': 'push',
            'GITHUB_REF': 'refs/heads/main', 'GITHUB_WORKFLOW_REF': release.REPOSITORY + '/' + release.WORKFLOW + '@refs/heads/main',
            'GITHUB_ENVIRONMENT': 'npm-publish', 'GITHUB_SHA': 'x'}
    release.ci_guard(good)
    for key, value in [('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_REF', 'refs/heads/feature'),
                       ('GITHUB_REPOSITORY', 'fork/repo'), ('GITHUB_ENVIRONMENT', 'other')]:
        rejected(lambda k=key, v=value: release.ci_guard({**good, k: v}))
    publish_sh = (ELECTRON.parent / 'publish.sh').read_text(encoding='utf-8')
    assert 'publication disabled' in publish_sh and 'ENABLE_ELECTRON_OH_PUBLISH' in publish_sh
    print('PASS publish.sh default-disabled (script text guard)')
    print('Host simulations are not Harmony device tests. No npm upload attempted.')

if __name__ == '__main__':
    main()
