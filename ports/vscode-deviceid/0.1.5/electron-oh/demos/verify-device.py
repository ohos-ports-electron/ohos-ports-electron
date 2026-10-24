#!/usr/bin/env python3
"""Two actual cold starts on the connected Harmony device; never uses old summaries."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

MARKER='OHDEVICEID '


def hdc(*args):
    return subprocess.check_output(['hdc',*args],text=True,stderr=subprocess.STDOUT,timeout=30)


def events(raw):
    result=[]
    for line in raw.splitlines():
        if MARKER not in line:continue
        try:result.append(json.loads(line.split(MARKER,1)[1]))
        except json.JSONDecodeError:pass
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--identity',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();identity=json.loads(args.identity.read_text());host=identity['host']
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    bundle='com.ohosportselectron.vscodedeviceid.'+host
    runs=[]
    for index in range(2):
        old={e.get('pid') for e in events(hdc('shell','hilog -x -e OHDEVICEID'))}
        hdc('shell','aa force-stop '+bundle)
        start=hdc('shell','aa start -a EntryAbility -b '+bundle+' -m '+('entry' if host=='node' else 'electron'))
        (output/f'run{index+1}-launch.log').write_text(start)
        assert 'success' in start.lower(),start
        deadline=time.monotonic()+120
        summary=None
        while time.monotonic()<deadline:
            raw=hdc('shell','hilog -x -e OHDEVICEID')
            fresh=[e for e in events(raw) if e.get('pid') not in old and e.get('host',host)==host]
            summaries=[e for e in fresh if e.get('kind')=='summary']
            if summaries:summary=summaries[-1];break
            fatal=[e for e in fresh if e.get('kind')=='fatal']
            if fatal:raise RuntimeError(str(fatal[-1]))
            time.sleep(2)
        filtered='\n'.join(line for line in raw.splitlines() if any(e.get('pid') not in old for e in events(line)))
        (output/f'run{index+1}-device.log').write_text(filtered+'\n')
        assert summary is not None,'no fresh summary; inspect '+str(output)
        (output/f'run{index+1}-results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
        assert summary['total']==summary['pass']==10 and summary['fail']==0,summary
        for key in ('packageName','packageVersion','packageSha256'):
            assert summary[key]==identity[key],key
        assert summary['packageFiles']==identity['packageFiles'],'different runtime package bytes'
        runs.append(summary)
    assert runs[0]['pid']!=runs[1]['pid'],'restart reused process'
    assert runs[0]['persistentId']==runs[1]['persistentId'],'persisted ID changed across cold starts'
    report={k:v for k,v in identity.items() if k not in ('signedHap','packageFiles')}
    report.update(status='passed',total=10,**{'pass':10},fail=0,pids=[r['pid'] for r in runs],persistentIdStable=True,versions=runs[-1]['versions'],
                  scope='Functional regression; alias/unsupported checks simulate platforms; read-exception case explicitly mocks only the failing read')
    (output/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
