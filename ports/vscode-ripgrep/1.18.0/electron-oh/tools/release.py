#!/usr/bin/env python3
"""Verify a frozen tar build, run host regressions, and publish behind CI guards."""
import argparse
import shutil
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

PORT=Path(__file__).resolve().parents[2]
REGISTRY='https://registry.npmjs.org/'
REPO='ohos-ports-electron/ohos-ports-electron'
WORKFLOW='.github/workflows/vscode-ripgrep-electron-oh.yml'
NAME='@ohos-ports-electron/vscode-ripgrep'
VERSION='1.18.0-electron-oh.0'
import release_channel as channel
POLICY=channel.resolve_policy(NAME,VERSION)
ROLES=['node','electron25','electron34','electron37','electron40']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def require(value,message):
 if not value:raise ValueError(message)
def get(url):
 try:
  with urllib.request.urlopen(url,timeout=45) as r:return r.read()
 except urllib.error.HTTPError as e:
  if e.code==404:return None
  raise
def metadata():
 data=get(REGISTRY+urllib.parse.quote(NAME,safe='')+'/'+VERSION)
 return json.loads(data) if data else None
def published_bytes(url,attempts=40):
 for attempt in range(attempts):
  raw=get(url)
  if raw is not None:return raw
  if attempt+1<attempts:
   print('Waiting for published tarball visibility',attempt+1,flush=True);time.sleep(15)
 raise ValueError('version metadata is visible but npm tarball is still processing after bounded observation')
def recipe_hashes():return {f.relative_to(PORT).as_posix():sha(f) for f in sorted(PORT.rglob('*')) if f.is_file() and not any(s in f.relative_to(PORT).parts for s in ['__pycache__','node_modules','.local'])}
def verify(bundle,evidence=True):
 lock=read(PORT/'electron-oh/inputs.lock.json');channel.check_config(lock,POLICY)
 require(lock.get('distTag')=='beta' and lock.get('requiredDistTags')==['latest','beta'],'active channel must be beta with latest and beta tags')
 manifest=read(bundle/'manifest.json')
 require(manifest['name']==NAME and manifest['version']==VERSION,'wrong candidate identity')
 require(sha(bundle/'candidate.tgz')==lock['candidate']['sha256']==manifest['sha256'],'candidate SHA256 mismatch')
 data=(bundle/'candidate.tgz').read_bytes()
 require('sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==lock['candidate']['integrity']==manifest['integrity'],'integrity mismatch')
 with tarfile.open(fileobj=io.BytesIO(data)) as t:
  names=t.getnames();require(len(names)==len(set(names)),'duplicate archive members')
  require(all(m.isfile() and m.name.startswith('package/') and '..' not in Path(m.name).parts for m in t.getmembers()),'unsafe archive')
  files={m.name[8:]:hashlib.sha256(t.extractfile(m).read()).hexdigest() for m in t.getmembers()}
  require(files==manifest['files']==read(PORT/'electron-oh/package-inventory.json'),'package inventory mismatch')
  meta=json.load(t.extractfile('package/package.json'))
  require(meta['repository']==lock['repository'],'wrong repository identity')
  require(not any(k in meta.get('scripts',{}) for k in ['preinstall','install','postinstall']),'unexpected lifecycle script')
 if os.environ.get('GITHUB_ACTIONS')=='true':require((bundle/'recipe-hashes.json').is_file() and (bundle/'build-identity.json').is_file(),'CI artifact missing recipe/commit identity')
 if (bundle/'recipe-hashes.json').exists():require(read(bundle/'recipe-hashes.json')==recipe_hashes(),'artifact recipe differs from current checkout')
 if (bundle/'build-identity.json').exists():
  identity=read(bundle/'build-identity.json')
  if os.environ.get('GITHUB_SHA'):require(identity['commit']==os.environ['GITHUB_SHA'],'artifact from another commit')
 if evidence:
  release=read(PORT/'electron-oh/release-evidence.json');require(release['status']=='ready','device evidence blocked')
  require(release['candidateSha256']==manifest['sha256'],'evidence candidate mismatch')
  require(set(release['targets'])==set(ROLES),'incomplete device matrix')
  archive=release['archive'];raw=get(archive['url']);require(raw is not None,'evidence archive missing')
  require(hashlib.sha256(raw).hexdigest()==archive['sha256'],'evidence archive SHA256 mismatch')
  with tarfile.open(fileobj=io.BytesIO(raw)) as t:
   names=t.getnames();require(len(names)==len(set(names)),'duplicate evidence member')
   for role in ROLES:
    for phase in ['baseline','candidate']:
     member='reports/'+phase+'/'+role+'/report.json';report=json.load(t.extractfile(member))
     require(report['kind']=='device' and (report['status']=='passed' if phase=='candidate' else report['status'] in ['passed','failed']),'device phase invalid')
     if role=='electron40' and phase=='candidate':
      condition=lock['runtimeConditions']['electron40'];actual=report.get('runtimeFix',{})
      require(actual.get('engineSha256')==condition['engineSha256'] and actual.get('helperSha256')==condition['helperSha256'] and actual.get('manifestSha256')==condition['manifestSha256'],'Electron 40 Worker runtime condition missing or changed')
     expected=manifest['sha256'] if phase=='candidate' else lock['baseline']['sha256']
     require(report['packageSha256']==expected,'device report bound to other bytes')
     runs=report['runs'];require(len(runs)>=2 and len({r['pid'] for r in runs})>=2 and len({r['runId'] for r in runs})>=2,'missing cold starts')
     for r in runs:
      require(r['packageSha256']==expected and len(r['results'])==r['total']==r['expectedTotal'],'incomplete assertions')
      if phase=='candidate':require(r['pass']==r['total'] and r['fail']==0 and all(c['status']=='passed' for c in r['results']),'candidate assertions not passed')
      else:require(r['status']=='passed' or (r.get('failureStage')=='library-load' and r['notRun']>0),'baseline did not record the real load failure')
     summary=release['targets'][role][phase]
     require(summary['reportSha256']==hashlib.sha256(t.extractfile(member).read()).hexdigest(),'report differs from checked release evidence')
 print('Verified frozen bytes, current recipe'+(' and five-target device evidence' if evidence else '; local artifact-only check'))
 return manifest
def host(bundle):
 manifest=verify(bundle)
 with tempfile.TemporaryDirectory(prefix='ripgrep-host-') as d:
  root=Path(d)
  package={'name':'ripgrep-host-regression','version':'1.0.0','private':True,'dependencies':{NAME:str((bundle/'candidate.tgz').resolve())}}
  (root/'package.json').write_text(json.dumps(package))
  lock=read(PORT/'electron-oh/tests/package-lock.json');lock['packages']['']['dependencies'][NAME]=str((bundle/'candidate.tgz').resolve());lock['packages']['node_modules/'+NAME]['resolved']='file:'+str((bundle/'candidate.tgz').resolve());(root/'package-lock.json').write_text(json.dumps(lock))
  shutil.copyfile(PORT/'electron-oh/tests/host.cjs',root/'host.cjs')
  (root/'config.json').write_text(json.dumps({'packageName':NAME,'packageVersion':VERSION,'files':manifest['files']}))
  subprocess.run(['npm','ci','--no-audit','--no-fund','--registry='+REGISTRY],cwd=root,check=True)
  subprocess.run(['node','host.cjs'],cwd=root,check=True)
def guard(env=None):
 env=env or os.environ
 require(env.get('ENABLE_ELECTRON_OH_PUBLISH')=='1','publication disabled')
 for k,v in {'GITHUB_REPOSITORY':REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':REPO+'/'+WORKFLOW+'@refs/heads/main'}.items():require(env.get(k)==v,'untrusted publication context: '+k)
def check_existing_tag(value,lock):
 allowed=[None,VERSION]
 if lock.get('bootstrap',{}).get('placeholderVersion')=='0.0.0-stage':allowed.append('0.0.0-stage')
 require(value in allowed,'tag points to another release; refusing automatic rollback')
def oidc_tags(tags):
 for tag in tags:
  guard();channel.check_tag_write(tag,VERSION,POLICY)
  subprocess.run(['npm','dist-tag','add',NAME+'@'+VERSION,tag,'--registry='+REGISTRY],check=True)
def wait_for_tags(attempts=12):
 for attempt in range(attempts):
  observed=json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe='')))['dist-tags']
  if all(observed.get(tag)==VERSION for tag in ['latest','beta']):return observed
  if attempt+1<attempts:
   print('Waiting for beta tag migration visibility',attempt+1,flush=True);time.sleep(10)
 raise ValueError('dist-tags not converged to latest and beta without legacy electron-oh')
def publish(bundle):
 guard();require(os.environ.get('GITHUB_SHA')==subprocess.check_output(['git','rev-parse','HEAD'],cwd=PORT,text=True).strip(),'publish checkout SHA mismatch');manifest=verify(bundle);current=metadata();uploaded=False
 if current:
  require(current['dist']['integrity']==manifest['integrity'],'version exists with other bytes')
  print('already-published; continue byte and tag verification')
 else:
  subprocess.run(['python3',str(PORT/'electron-oh/tools/release_channel.py'),'run-publish','--package',NAME,'--version',VERSION,'--config',str(PORT/'electron-oh/inputs.lock.json'),'--','npm','publish',str(bundle/'candidate.tgz'),'--access','public','--tag','beta','--provenance','--ignore-scripts'],check=True);uploaded=True
  for attempt in range(40):
   current=metadata()
   if current:break
   print('Waiting for registry processing',attempt+1,flush=True);time.sleep(15)
  require(current is not None,'published package not visible after ten minutes')
 require(current['dist']['integrity']==manifest['integrity'],'registry integrity mismatch')
 raw=published_bytes(current['dist']['tarball']);require(hashlib.sha256(raw).hexdigest()==manifest['sha256'],'registry tarball changed frozen bytes')
 package=json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe='')))
 for tag in ['latest','beta']:
  value=package['dist-tags'].get(tag)
  check_existing_tag(value,read(PORT/'electron-oh/inputs.lock.json'))
 oidc_tags(['latest','beta'])
 observed=wait_for_tags()
 channel.check_registry(json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe=''))),POLICY)
 print(json.dumps({'uploaded':uploaded,'registrySha256':hashlib.sha256(raw).hexdigest(),'distTags':observed},indent=2))
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['verify','host','bind','publish']);p.add_argument('--bundle',type=Path,required=True);a=p.parse_args();bundle=a.bundle.resolve()
 if a.action=='bind':
  (bundle/'recipe-hashes.json').write_text(json.dumps(recipe_hashes(),indent=2)+'\n')
  try:commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=PORT,text=True).strip()
  except subprocess.CalledProcessError:commit=None
  (bundle/'build-identity.json').write_text(json.dumps({'commit':commit,'recipeSha256':sha(bundle/'recipe-hashes.json')},indent=2)+'\n')
 elif a.action=='verify':verify(bundle)
 elif a.action=='host':host(bundle)
 else:publish(bundle)
if __name__=='__main__':main()
