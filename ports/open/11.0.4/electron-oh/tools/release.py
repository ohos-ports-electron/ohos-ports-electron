#!/usr/bin/env python3
"""Verify a frozen open package build, run host regressions, and publish behind CI guards."""
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
import release_channel
import time
import urllib.error
import urllib.parse
import urllib.request

PORT=Path(__file__).resolve().parents[2]
REGISTRY='https://registry.npmjs.org/'
REPO='ohos-ports-electron/ohos-ports-electron'
WORKFLOW='.github/workflows/open-electron-oh.yml'
NAME='@ohos-ports-electron/open'
VERSION='11.0.4-electron-oh.0'
ROLES=['node','electron25','electron34','electron37','electron40']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def require(value,message):
 if not value:raise ValueError(message)
def get(url):
 # Release URLs redirect to short-lived signed asset URLs. Request a fresh
 # redirect rather than reusing an intermediary's stale redirect response.
 for attempt in range(3):
  current=url;parts=urllib.parse.urlsplit(url)
  if parts.hostname=='github.com' and '/releases/download/' in parts.path:
   query=urllib.parse.parse_qsl(parts.query,keep_blank_values=True)+[('_open_evidence_nonce',str(time.time_ns()))]
   current=urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(query)))
  request=urllib.request.Request(current,headers={'Cache-Control':'no-cache','User-Agent':'open-electron-oh-release'})
  try:
   with urllib.request.urlopen(request,timeout=45) as response:return response.read()
  except urllib.error.HTTPError as error:
   if error.code==404:return None
   if error.code not in [502,503,504] or attempt==2:raise
  except (urllib.error.URLError,TimeoutError):
   if attempt==2:raise
  print('Transient download failure; bounded retry '+str(attempt+1)+'/2',flush=True)
  time.sleep(attempt+1)
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
 lock=read(PORT/'electron-oh/inputs.lock.json')
 release_channel.check_config(lock,release_channel.resolve_policy(NAME,VERSION))
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
 require((bundle/'recipe-hashes.json').exists() and (bundle/'build-identity.json').exists(),'missing build identity or recipe binding')
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
     require(report['kind']=='device' and (report['status']=='passed' if phase=='candidate' else report['status'] in ['failed','passed','blocked']),'device phase missing or candidate failed')
     expected=manifest['sha256'] if phase=='candidate' else lock['baseline']['sha256']
     require(report['packageSha256']==expected,'device report bound to other bytes')
     runs=report['runs'];require(len(runs)>=2 and len({r['pid'] for r in runs})>=2 and len({r['runId'] for r in runs})>=2,'missing cold starts')
     for r in runs:
      require(r['packageSha256']==expected and len(r['results'])==r['total']==r['expectedTotal'],'incomplete assertions')
      if phase=='candidate':require(r['pass']==r['total'] and r['fail']==0 and all(c['status']=='passed' for c in r['results']),'candidate assertions not passed')
     summary=release['targets'][role][phase]
     require(summary['reportSha256']==hashlib.sha256(t.extractfile(member).read()).hexdigest(),'report differs from checked release evidence')
 print('Verified frozen bytes, current recipe and five-target device evidence')
 return manifest
def host(bundle):
 manifest=verify(bundle)
 with tempfile.TemporaryDirectory(prefix='open-host-') as d:
  root=Path(d)
  (root/'package.json').write_text(json.dumps({'private':True,'name':'open-host-regression','version':'1.0.0','dependencies':{NAME:str((bundle/'candidate.tgz').resolve())}}))
  lock=read(PORT/'electron-oh/tests/package-lock.json');lock['packages']['']['dependencies'][NAME]=str((bundle/'candidate.tgz').resolve());lock['packages']['node_modules/'+NAME]['resolved']='file:'+str((bundle/'candidate.tgz').resolve());(root/'package-lock.json').write_text(json.dumps(lock))
  subprocess.run(['npm','ci','--no-audit','--no-fund','--registry='+REGISTRY],cwd=root,check=True,timeout=180)
  env=os.environ.copy();env['OPEN_PACKAGE_ROOT']=str(root/'node_modules'/NAME)
  binary=env.get('HOST_ELECTRON_BINARY') or 'node'
  if binary!='node':env['ELECTRON_RUN_AS_NODE']='1'
  print('Host protocol model tests simulate platform/Ability replies; these are not fresh device tests',flush=True)
  subprocess.run([binary,'--test',str(PORT/'electron-oh/tests/host-contract.mjs')],cwd=root,env=env,check=True,timeout=90)
def guard(env=None):
 env=env or os.environ
 require(env.get('ENABLE_ELECTRON_OH_PUBLISH')=='1','publication disabled')
 for k,v in {'GITHUB_REPOSITORY':REPO,'GITHUB_EVENT_NAME':'push','GITHUB_REF':'refs/heads/main','GITHUB_ENVIRONMENT':'npm-publish','GITHUB_WORKFLOW_REF':REPO+'/'+WORKFLOW+'@refs/heads/main'}.items():require(env.get(k)==v,'untrusted publication context: '+k)
def oidc_tag(tag, method='PUT'):
 # npm dist-tag add returns early when the value already matches. Authenticate
 # without a fallback credential, then perform the guarded tag mutation.
 guard()
 require(method=='PUT','only tag updates are authorized by this recipe');release_channel.check_tag_write(tag,VERSION,release_channel.resolve_policy(NAME,VERSION))
 url=os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL');credential=os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
 require(url and credential and urllib.parse.urlsplit(url).scheme=='https','GitHub OIDC request identity missing')
 parts=urllib.parse.urlsplit(url);query=urllib.parse.parse_qsl(parts.query,keep_blank_values=True)
 query=[(k,v) for k,v in query if k!='audience']+[('audience','npm:registry.npmjs.org')]
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
 request=urllib.request.Request(endpoint,data=json.dumps(VERSION).encode() if method=='PUT' else None,method=method,headers={'Authorization':'Bearer '+exchanged['token'],'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=45) as response:
  require(200<=response.status<300,'npm rejected OIDC dist-tag write');print('OIDC dist-tag '+method+' '+tag+': HTTP '+str(response.status),flush=True)
def oidc_tags(tags):
 # A successful registry mutation can consume the exchanged identity. Use a
 # fresh exchange per operation, as separate npm dist-tag invocations do.
 for tag in tags:oidc_tag(tag)
def wait_for_tags(attempts=12):
 for attempt in range(attempts):
  observed=json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe='')))['dist-tags']
  if all(observed.get(tag)==VERSION for tag in ['latest','beta']) :return observed
  if attempt+1<attempts:
   print('Waiting for beta tag migration visibility',attempt+1,flush=True);time.sleep(10)
 raise ValueError('dist-tags not converged to latest and beta without legacy electron-oh')
def publish(bundle):
 guard();manifest=verify(bundle);current=metadata();uploaded=False
 if current:
  require(current['dist']['integrity']==manifest['integrity'],'version exists with other bytes')
  print('already-published; continue byte and tag verification')
 else:
  subprocess.run(['python3',str(PORT/'electron-oh/tools/release_channel.py'),'run-publish','--package',NAME,'--version',VERSION,'--config',str(PORT/'electron-oh/inputs.lock.json'),'--','npm','publish',str(bundle/'candidate.tgz'),'--access','public','--tag','beta','--ignore-scripts'],check=True);uploaded=True
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
  require(value in [None,VERSION,'0.0.0-stage'],'tag points to another release; refusing automatic rollback')
 oidc_tags(['latest','beta'])
 observed=wait_for_tags()
 release_channel.check_registry(json.loads(get(REGISTRY+urllib.parse.quote(NAME,safe=''))),release_channel.resolve_policy(NAME,VERSION))
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
