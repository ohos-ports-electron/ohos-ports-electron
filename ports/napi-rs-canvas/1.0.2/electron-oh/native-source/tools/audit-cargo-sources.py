#!/usr/bin/env python3
"""Rehash crate archives and the exact source files Cargo used.
SPDX-License-Identifier: MIT
"""
import argparse,hashlib,json,re,tarfile
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--metadata',type=Path,required=True);p.add_argument('--lock',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
meta=json.loads(a.metadata.read_text());expected={}
for block in a.lock.read_text().split('[[package]]')[1:]:
 values={k:re.search(r'^'+k+r' = "([^"]+)"',block,re.M).group(1) for k in ['name','version']}
 m=re.search(r'^checksum = "([^"]+)"',block,re.M)
 if m:expected[(values['name'],values['version'])]=m.group(1)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
rows=[];total=0;license_dir=a.output.parent/'cargo-licenses';license_dir.mkdir(exist_ok=True)
for pkg in meta['packages']:
 if not str(pkg.get('source','')).startswith('registry+'):continue
 root=Path(pkg['manifest_path']).parent;check=expected[(pkg['name'],pkg['version'])]
 crate=root.parents[2]/'cache'/root.parent.name/(root.name+'.crate');assert sha(crate)==check,(crate,'archive differs from Cargo.lock')
 count=0
 with tarfile.open(crate) as archive:
  for item in archive:
   if not item.isfile():continue
   parts=Path(item.name).parts;assert parts[0]==root.name and '..' not in parts
   target=root.joinpath(*parts[1:]);assert target.is_file(),target
   assert sha(target)==hashlib.sha256(archive.extractfile(item).read()).hexdigest(),('modified registry source',target)
   count+=1
 chosen=[]
 for f in root.iterdir():
  if f.is_file() and any(f.name.upper().startswith(v) for v in ['LICENSE','COPYING','NOTICE','PATENTS']):
   target=license_dir/root.name/f.name;target.parent.mkdir(exist_ok=True);target.write_bytes(f.read_bytes());chosen.append({'file':str(target.relative_to(a.output.parent)),'sha256':sha(target)})
 total+=count;rows.append({'name':pkg['name'],'version':pkg['version'],'checksum':check,'sourceFilesVerified':count,'declaredLicense':pkg.get('license'),'licenseFiles':chosen})
result={'status':'passed','registryPackages':len(rows),'sourceFilesVerified':total,'packages':rows,'verification':'Cargo.lock checksum == cached .crate SHA256; extracted source file bytes compared with verified archive members'}
a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='packages'}))
