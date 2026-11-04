#!/usr/bin/env python3
"""Verify a frozen compressing build, run host regressions, and publish behind CI guards."""
import argparse
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
WORKFLOW='.github/workflows/compressing-electron-oh.yml'
NAME='@ohos-ports-electron/compressing'
VERSION='2.1.3-electron-oh.0'
ROLES=['node','electron34','electron37','electron40']
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
def recipe_hashes():return {f.relative_to(PORT).as_posix():sha(f) for f in sorted(PORT.rglob('*')) if f.is_file() and not any(s in f.relative_to(PORT).parts for s in ['__pycache__','node_modules','.local','.build','dist'])}
def verify(bundle,evidence=True):
 lock=read(PORT/'electron-oh/inputs.lock.json');manifest=read(bundle/'manifest.json')
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
     require(report['status']=='passed' and report['kind']=='device','device phase failed')
     expected=manifest['sha256'] if phase=='candidate' else lock['baseline']['sha256']
     require(report['packageSha256']==expected,'device report bound to other bytes')
     runs=report['runs'];require(len(runs)>=2 and len({r['pid'] for r in runs})>=2 and len({r['runId'] for r in runs})>=2,'missing cold starts')
     for r in runs:
      require(r['packageSha256']==expected and r['pass']==r['total']==r['expectedTotal'] and r['fail']==0,'incomplete assertions')
      require(len(r['results'])==r['total'] and all(c['status']=='passed' for c in r['results']),'assertions not passed')
     summary=release['targets'][role][phase]
     require(summary['reportSha256']==hashlib.sha256(t.extractfile(member).read()).hexdigest(),'report differs from checked release evidence')
 print('Verified frozen bytes, current recipe and four-target device evidence')
 return manifest
def host(bundle):
 manifest=verify(bundle)
 with tempfile.TemporaryDirectory(prefix='compressing-host-') as d:
  root=Path(d)
  (root/'package.json').write_text(json.dumps({'private':True,'name':'compressing-host-regression','version':'1.0.0','dependencies':{NAME:str((bundle/'candidate.tgz').resolve())}}))
  (root/'suite.cjs').write_bytes((PORT/'electron-oh/tests/suite.cjs').read_bytes())
  config={'phase':'candidate','targetId':'host-'+subprocess.check_output(['node','--version'],text=True).strip(),'packageName':NAME,'packageVersion':VERSION,'packageSha256':manifest['sha256'],'libraryFiles':{k:v for k,v in manifest['files'].items() if k.startswith('lib/') or k=='index.js'}}
  (root/'config.json').write_text(json.dumps(config))
  (root/'run.cjs').write_text("require('./suite.cjs').run(require('./config.json'),require('path').join(__dirname,'results')).then(r=>{if(r.status!=='passed')process.exitCode=1}).catch(e=>{console.error(e);process.exitCode=1})")
  subprocess.run(['npm','install','--no-audit','--no-fund','--registry='+REGISTRY],cwd=root,check=True)
  subprocess.run(['node','run.cjs'],cwd=root,check=True)
def guard(env=None):
 env=env or os.environ
 require(env.get('ENABLE_ELECTRON_OH_PUBLISH')=='1','publication disabled')
 for k,v in {'GITHUB_REPOSITORY':REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':REPO+'/'+WORKFLOW+'@refs/heads/main'}.items():require(env.get(k)==v,'untrusted publication context: '+k)
def oidc_tag(tag):
 # npm dist-tag add returns early when the value already matches. Authenticate
 # without a fallback credential, then PUT that same value to verify write scope.
 guard()
 require(tag in ['latest','electron-oh'],'unexpected distribution tag')
 url=os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL');credential=os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
 require(url and credential and urllib.parse.urlsplit(url).scheme=='https','GitHub OIDC request identity missing')
 parts=urllib.parse.urlsplit(url);query=urllib.parse.parse_qsl(parts.query,keep_blank_values=True)
 query=[(k,v) for (k,v) in query if k!='audience']+[('audience','npm:registry.npmjs.org')]
 url=urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(query)))
 request=urllib.request.Request(url,headers={'Authorization':'Bearer '+credential,'Accept':'application/json'})
 with urllib.request.urlopen(request,timeout=45) as response:identity=json.load(response)
 require(isinstance(identity.get('value'),str) and identity['value'],'GitHub OIDC token response missing')
 exchange=REGISTRY+'-/npm/v1/oidc/token/exchange/package/'+urllib.parse.quote(NAME,safe='')
 request=urllib.request.Request(exchange,method='POST',headers={'Authorization':'Bearer '+identity['value'],'Accept':'application/json'})
 with urllib.request.urlopen(request,timeout=45) as response:exchanged=json.load(response)
 require(isinstance(exchanged.get('token'),str) and exchanged['token'],'npm OIDC token response missing')
 print('GitHub OIDC token exchange succeeded; no fallback credential used',flush=True)
 endpoint=REGISTRY+'-/package/'+urllib.parse.quote(NAME,safe='')+'/dist-tags/'+tag
 request=urllib.request.Request(endpoint,data=json.dumps(VERSION).encode(),method='PUT',headers={'Authorization':'Bearer '+exchanged['token'],'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=45) as response:
  require(200<=response.status<300,'npm rejected OIDC dist-tag write');print('OIDC dist-tag PUT '+tag+': HTTP '+str(response.status),flush=True)
def oidc_tags(tags):
 # A successful registry mutation can consume the exchanged identity. Use a
 # fresh exchange per operation, as separate npm dist-tag invocations do.
 for tag in tags:oidc_tag(tag)
def publish(bundle):
 guard();manifest=verify(bundle);current=metadata();uploaded=False
 if current:
  require(current['dist']['integrity']==manifest['integrity'],'version exists with other bytes')
  print('already-published; continue byte and tag verification')
 else:
  subprocess.run(['npm','publish',str(bundle/'candidate.tgz'),'--access','public','--tag','electron-oh'],check=True);uploaded=True
  for attempt in range(40):
   current=metadata()
   if current:break
   print('Waiting for registry processing',attempt+1,flush=True);time.sleep(15)
  require(current is not None,'published package not visible after ten minutes')
 require(current['dist']['integrity']==manifest['integrity'],'registry integrity mismatch')
 raw=published_bytes(current['dist']['tarball']);require(hashlib.sha256(raw).hexdigest()==manifest['sha256'],'registry tarball changed frozen bytes')
 package=json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe='')))
 for tag in ['latest','electron-oh']:
  value=package['dist-tags'].get(tag)
  require(value in [None,VERSION],'tag points to another release; refusing automatic rollback')
 oidc_tags(['latest','electron-oh'])
 # A dist-tag PUT can be served by a stale cached packument on the immediate
 # re-read (observed in production: both PUTs returned 204 but the follow-up
 # GET still showed the old document). Poll briefly before declaring failure,
 # mirroring the bounded tarball-visibility retry above.
 observed={}
 for attempt in range(12):
  observed=json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe='')))['dist-tags']
  if all(observed.get(t)==VERSION for t in ['latest','electron-oh']):break
  print('Waiting for dist-tag visibility',attempt+1,flush=True);time.sleep(10)
 require(all(observed.get(t)==VERSION for t in ['latest','electron-oh']),'dist-tags not converged')
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
