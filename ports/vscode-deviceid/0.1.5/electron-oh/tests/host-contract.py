#!/usr/bin/env python3
"""Real npm installation plus platform simulation and frozen-handoff negative tests."""
import argparse
import contextlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import workflow


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,required=True);args=p.parse_args()
    bundle=args.bundle.resolve();meta=workflow.verify(bundle,'bundle.json')
    workflow.compare(bundle/'baseline.tgz',bundle/'candidate.tgz',workflow.read(bundle/'recipe/inputs.lock.json'))
    with tempfile.TemporaryDirectory(prefix='vscode-deviceid-host-test-') as temp:
        work=Path(temp)
        (work/'package.json').write_text('{"name":"vscode-deviceid-contract","version":"1.0.0","private":true}\n')
        subprocess.run(['npm','install',str(bundle/'candidate.tgz'),'--omit=dev','--no-audit','--no-fund'],cwd=work,check=True)
        print('PASS: ordinary npm install without ignore-scripts')
        (work/'input.json').write_text(json.dumps({'packageName':meta['packageName'],'packageVersion':meta['packageVersion'],'packageSha256':meta['candidateSha256'],'packageFiles':meta['packageFiles'],'host':'host'}))
        shutil.copyfile(ROOT/'demos/shared/suite.cjs',work/'suite.cjs')
        run=work/'run.cjs'
        run.write_text("require('./suite.cjs')({userData:require('node:path').join(__dirname,'home'),runId:'host',emit:()=>{}}).then(r=>{console.log(JSON.stringify(r));if(r.fail)process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});")
        result=subprocess.run(['node',run],cwd=work,check=True,text=True,capture_output=True)
        report=json.loads(result.stdout);assert report['pass']==report['total']==10
        print('PASS: ten functional host checks, including ohos/openharmony simulations')
        # Baseline lacks ohos, whereas the new package includes it. This check
        # intentionally simulates a platform; it is not a real Harmony host run.
        baseline=work/'baseline';baseline.mkdir()
        for name,data in workflow.package_files(bundle/'baseline.tgz').items():
            target=baseline/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        probe=work/'probe.cjs'
        probe.write_text("Object.defineProperty(process,'platform',{value:'ohos'});try{require('./baseline/dist/index.js');throw Error('baseline accepted ohos unexpectedly')}catch(e){if(!e.message.includes('Unsupported platform'))throw e;console.log('baseline rejects ohos as expected')}")
        subprocess.run(['node',probe],cwd=work,check=True)
        print('PASS: baseline/new-package platform behavior differs as intended')
        cloned=work/'tamper';shutil.copytree(bundle,cloned)
        for mode in ('changed','missing','extra'):
            candidate=cloned/'candidate.tgz';candidate.write_bytes((bundle/'candidate.tgz').read_bytes())
            extra=cloned/'unexpected';extra.unlink(missing_ok=True)
            if mode=='changed':candidate.write_bytes(b'changed')
            elif mode=='missing':candidate.unlink()
            else:extra.write_text('unexpected')
            try:workflow.verify(cloned,'bundle.json')
            except ValueError:print('PASS: rejects '+mode+' handoff')
            else:raise AssertionError('tampering accepted')
        # A dry publication wrapper must not require credentials or a release dir.
        result=subprocess.run(['bash',str(ROOT.parent/'publish.sh')],cwd=work,text=True,capture_output=True,check=True)
        assert 'publication disabled' in result.stdout
        print('PASS: publication switch defaults closed')
    print('No npm upload was attempted.')


if __name__=='__main__':main()
