#!/usr/bin/env python3
"""Ordinary installation, real functional checks and release guard regressions."""
import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch
import urllib.error

ELECTRON = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ELECTRON / 'tools'))
import workflow
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
    with tempfile.TemporaryDirectory(prefix='vscode-deviceid-contract-') as temp:
        root = Path(temp)
        (root / 'package.json').write_text(json.dumps({'name':'host-contract','version':'1.0.0','private':True,'dependencies':{meta['packageName']:'file:./candidate.tgz'}}))
        shutil.copyfile(bundle / 'candidate.tgz', root / 'candidate.tgz')
        shutil.copyfile(ELECTRON / 'tests/dependencies.lock.json', root / 'package-lock.json')
        subprocess.run(['npm', 'ci', '--omit=dev', '--foreground-scripts', '--no-audit', '--no-fund'], cwd=root, check=True)
        (root / 'input.json').write_text(json.dumps({**meta, 'packageSha256': meta['candidateSha256'], 'host': 'host'}))
        shutil.copyfile(ELECTRON / 'tools/suite.cjs', root / 'suite.cjs')
        (root / 'run.cjs').write_text("require('./suite.cjs')({userData:require('node:path').join(__dirname,'home'),runId:String(process.pid),emit:()=>{}}).then(r=>{console.log(JSON.stringify(r));if(r.fail)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});")
        results = []
        for _ in range(2):
            r = json.loads(subprocess.check_output(['node', str(root / 'run.cjs')], cwd=root, text=True))
            assert r['pass'] == r['total'] == 10 and r['fail'] == 0
            results.append(r)
        assert results[0]['pid'] != results[1]['pid'] and results[0]['persistentId'] == results[1]['persistentId']
        print('PASS ordinary npm install; 10/10 functional checks twice; persisted ID across processes')
        original = json.loads((ELECTRON / 'release-evidence.json').read_text())
        bad = json.loads(json.dumps(original));bad['candidateSha256'] = '0' * 64
        native_read = release.read
        with patch.object(release, 'read', side_effect=lambda p: bad if p.name == 'release-evidence.json' else native_read(p)):
            rejected(lambda: release.validate(bundle))
        tamper = root / 'tamper';shutil.copytree(bundle, tamper)
        (tamper / 'candidate.tgz').write_bytes(b'changed')
        rejected(lambda: release.validate(tamper))
        good = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': release.REPOSITORY, 'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main', 'GITHUB_WORKFLOW_REF': release.REPOSITORY + '/' + release.WORKFLOW + '@refs/heads/main', 'GITHUB_ENVIRONMENT': 'npm-publish', 'GITHUB_SHA': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ELECTRON,text=True).strip()}
        release.ci_guard(good)
        for key, value in [('GITHUB_EVENT_NAME','pull_request'),('GITHUB_REF','refs/heads/feature'),('GITHUB_REPOSITORY','fork/repo'),('GITHUB_SHA','wrong'),('GITHUB_WORKFLOW_REF','wrong'),('GITHUB_ACTIONS','false')]:
            rejected(lambda k=key, v=value: release.ci_guard({**good, k: v}))
        with patch.object(release, 'registry_version', return_value={'dist': {'integrity': 'wrong'}}):
            rejected(lambda: release.publish(bundle))
        with patch.object(release.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('https://registry.npmjs.org/', 403, 'Forbidden', {}, None)):
            rejected(lambda: release.registry_version('example'))
        with patch.object(release, 'registry_version', return_value=None), patch.object(release.subprocess, 'run', side_effect=AssertionError('dry run uploaded')):
            release.publish(bundle)
        result = subprocess.check_output(['bash', str(ELECTRON.parent / 'publish.sh')], env={k:v for k,v in os.environ.items() if k != 'ENABLE_ELECTRON_OH_PUBLISH'}, text=True)
        assert 'publication disabled' in result
        print('PASS mismatched evidence, tampering, branch/repository/commit guards, occupied version, registry failure and default-disabled/dry-run release checks')
    print('Host simulations are not Harmony device tests. No npm upload attempted.')


if __name__ == '__main__':
    main()
