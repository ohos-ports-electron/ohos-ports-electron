#!/usr/bin/env python3
"""Execute real host inference for a caller-supplied frozen candidate; never a device verdict."""
import argparse,hashlib,json,shutil,subprocess,tarfile
from pathlib import Path,PurePosixPath
HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--tgz',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();out=a.output.resolve();shutil.copytree(HERE.parent/'tests',out);shutil.copyfile(a.tgz,out/'input.tgz');files={};meta=None
with tarfile.open(a.tgz) as t:
 for f in t.getmembers():
  parts=PurePosixPath(f.name);assert not parts.is_absolute() and '..' not in parts.parts and parts.parts[0]=='package';assert f.isfile() or f.isdir()
  if not f.isfile():continue
  rel='/'.join(parts.parts[1:]);assert rel not in files;data=t.extractfile(f).read();files[rel]=hashlib.sha256(data).hexdigest()
  if rel=='package.json':meta=json.loads(data)
identity={'packageName':meta['name'],'packageVersion':meta['version'],'packageSha256':hashlib.sha256(a.tgz.read_bytes()).hexdigest(),'packageFiles':files};(out/'input.json').write_text(json.dumps(identity,indent=2)+'\n')
for cmd,log in [(['npm','ci','--omit=dev','--no-audit','--no-fund','--foreground-scripts'],'npm-ci.log'),(['node','node-suite-entry.cjs'],'host.log')]:
 r=subprocess.run(cmd,cwd=out,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(out/log).write_text(r.stdout)
 if r.returncode:raise SystemExit(log+' failed: '+str(r.returncode))
events=[json.loads(line.split('OHORT ',1)[1]) for line in (out/'host.log').read_text().splitlines() if line.startswith('OHORT ')];report=next(e for e in reversed(events) if e['kind']=='summary');assert report['pass']==report['expectedTotal'] and report['fail']==0;report.update(execution='host',status='passed',deviceConclusion=False);(out/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['status','execution','pass','fail','platform','packageSha256']},indent=2))
