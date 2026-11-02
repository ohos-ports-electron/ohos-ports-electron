#!/usr/bin/env python3
"""Rebuild from the registry WASM with a pinned, verified Binaryen distribution."""
import argparse,base64,gzip,hashlib,io,json,platform,re,shutil,subprocess,tarfile,urllib.request
from pathlib import Path
def sha(data):return hashlib.sha256(data).hexdigest()
def build(port,out,tool_archive=None):
    lock=json.loads((port/'electron-oh/inputs.lock.json').read_text())
    if out.exists():raise RuntimeError(f'Output exists: {out}')
    out.mkdir(parents=True)
    data=urllib.request.urlopen(lock['baseline']['url'],timeout=60).read()
    assert sha(data)==lock['baseline']['sha256']
    assert 'sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()==lock['baseline']['integrity']
    (out/'baseline.tgz').write_bytes(data)
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        assert len(t.getnames())==len(set(t.getnames()))
        assert all(m.name.startswith('package/') and '..' not in Path(m.name).parts and (m.isfile() or m.isdir()) for m in t.getmembers())
        t.extractall(out/'staging',filter='data')
    stage=out/'staging/package'
    for item in lock['patches']:
        patch=port/item['path'];assert sha(patch.read_bytes())==item['sha256']
        result=subprocess.run(['patch','--batch','--forward','-p1','-i',str(patch)],cwd=stage,check=True,capture_output=True,text=True)
        assert 'fuzz' not in result.stdout.lower() and 'offset' not in result.stdout.lower(),result.stdout
    key=platform.system()+'-'+platform.machine()
    source=lock['wasm2js']['archives'][key]
    archive=tool_archive.read_bytes() if tool_archive else urllib.request.urlopen(source['url'],timeout=120).read()
    assert sha(archive)==source['sha256'],'Binaryen archive hash mismatch'
    (out/'binaryen.tar.gz').write_bytes(archive)
    with tarfile.open(fileobj=io.BytesIO(archive)) as t:
        assert all(not m.name.startswith('/') and '..' not in Path(m.name).parts for m in t.getmembers())
        t.extractall(out/'binaryen',filter='data')
    tool=next((out/'binaryen').glob('*/bin/wasm2js'))
    version=subprocess.check_output([str(tool),'--version'],text=True).strip()
    assert re.fullmatch(r'wasm2js version '+lock['wasm2js']['version']+r'( \(version_'+lock['wasm2js']['version']+r'\))?',version),version
    wasm=stage/'release/onig.wasm';assert sha(wasm.read_bytes())==lock['wasm2js']['wasmSha256']
    subprocess.run([str(tool),str(wasm),'-o',str(out/'onig.asm.js')],check=True)
    original=(out/'onig.asm.js').read_text()
    asm=re.sub(r'^import \* as \w+ from \'\w+\';\n','',original,flags=re.M)
    exports=re.findall(r'export var (\w+) = retasmFunc\.(\w+);',asm)
    assert len(exports)>10 and all(a==b for a,b in exports),exports
    asm=re.sub(r'export var (\w+) = retasmFunc\.(\w+);','',asm)
    asm,count=re.subn(r'var retasmFunc = asmFunc\(\{[^}]+\}\);','',asm);assert count==1
    asm=asm.rstrip()+'''\n// CommonJS wrapper; generated from the exact upstream WASM by Binaryen 133.
module.exports = function createOnigAsmModule(env, wasi_snapshot_preview1) {
  return asmFunc({env: env, wasi_snapshot_preview1: wasi_snapshot_preview1});
};
'''
    assert not re.search(r'^import |^export ',asm,flags=re.M)
    if lock['wasm2js'].get('asmSha256'):
        assert sha(asm.encode())==lock['wasm2js']['asmSha256'],'translated asm.js differs from the frozen input'
    (stage/'release/onig.asm.cjs').write_text(asm)
    readme=port/'electron-oh/PACKAGE_README.md';assert sha(readme.read_bytes())==lock['readmeSha256']
    license=port/'electron-oh/BINARYEN-LICENSE.txt';assert sha(license.read_bytes())==lock['wasm2js']['licenseSha256']
    shutil.copyfile(stage/'README.md',stage/'README.upstream.md');shutil.copyfile(readme,stage/'README.md');shutil.copyfile(license,stage/'BINARYEN-LICENSE.txt')
    meta=json.loads((stage/'package.json').read_text());assert all(meta[k]==lock['candidate'][k] for k in ['name','version']);assert meta['repository']==lock['repository']
    buf=io.BytesIO();inventory={}
    with tarfile.open(fileobj=buf,mode='w',format=tarfile.USTAR_FORMAT) as t:
        for f in sorted(stage.rglob('*')):
            if not f.is_file():continue
            rel=f.relative_to(stage).as_posix();content=f.read_bytes();info=tarfile.TarInfo('package/'+rel)
            info.size=len(content);info.mode=0o644;info.uid=info.gid=0;info.mtime=0;info.uname=info.gname=''
            t.addfile(info,io.BytesIO(content));inventory[rel]=sha(content)
    packed=gzip.compress(buf.getvalue(),compresslevel=9,mtime=0);packed=packed[:9]+b'\xff'+packed[10:]
    (out/'candidate.tgz').write_bytes(packed)
    manifest={'name':meta['name'],'version':meta['version'],'sha256':sha(packed),'integrity':'sha512-'+base64.b64encode(hashlib.sha512(packed).digest()).decode(),'files':inventory,'baselineSha256':sha(data),'conversion':{'toolVersion':version,'archiveSha256':sha(archive),'inputWasmSha256':sha(wasm.read_bytes()),'asmSha256':sha(asm.encode()),'exports':[a for a,b in exports]}}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({k:v for k,v in manifest.items() if k!='files'},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--tool-archive',type=Path);a=p.parse_args();build(a.port.resolve(),a.output.resolve(),a.tool_archive)
