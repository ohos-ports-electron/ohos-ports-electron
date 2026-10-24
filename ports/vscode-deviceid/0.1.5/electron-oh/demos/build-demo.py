#!/usr/bin/env python3
"""Build/sign fresh HAPs using only the supplied frozen candidate and explicit runtimes."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from workflow import package_files, read, sha, verify, write


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--host',choices=['node','electron'],required=True)
    p.add_argument('--bundle',type=Path,required=True)
    p.add_argument('--sdk',type=Path,required=True)
    p.add_argument('--java-home',type=Path,required=True)
    p.add_argument('--runtime-dir',type=Path)
    p.add_argument('--node-runtime',type=Path)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--install',action='store_true')
    args=p.parse_args();host=args.host;bundle=args.bundle.resolve();manifest=verify(bundle,'bundle.json')
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=False)
    scratch=Path(tempfile.mkdtemp(prefix='vscode-deviceid-'+host+'-'))
    project=scratch/'project'
    shutil.copytree(ROOT/'demos'/host/'project',project,ignore=shutil.ignore_patterns('._*','.DS_Store','.hvigor','.cxx','build','node_modules','oh_modules','libs','hnp','local.properties'))
    if host=='electron':
        assert args.runtime_dir,'supply --runtime-dir'
        template_lock=read(ROOT/'demos/electron/template.lock.json')
        for name,record in template_lock['files'].items():
            source=args.runtime_dir.resolve()/name
            assert sha(source)==record['sourceSha256'],'Electron template source mismatch: '+name
            data=source.read_text().encode() if record['normalizeNewlines'] else source.read_bytes()
            assert hashlib.sha256(data).hexdigest()==record['outputSha256'],'template normalization mismatch'
            target=project/name;assert not target.exists(),'unexpected template override: '+name
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    (output/'workspace.txt').write_text(str(scratch)+'\n')
    env={**os.environ,'JAVA_HOME':str(args.java_home.resolve()),'DEVECO_SDK_HOME':str(args.sdk.resolve())}
    env['PATH']=str(args.java_home.resolve()/'bin')+os.pathsep+env['PATH']
    def run(command,log,cwd=project):
        result=subprocess.run(list(map(str,command)),cwd=cwd,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        (output/log).write_text(result.stdout)
        if result.returncode:raise RuntimeError(log+': '+str(result.returncode)+'; '+str(output))
        return result.stdout
    payload=scratch/'payload';payload.mkdir()
    for file in (ROOT/'demos/shared').iterdir():
        if file.is_file():shutil.copyfile(file,payload/file.name)
    if host=='electron':
        shutil.copytree(project/'app-src',payload,dirs_exist_ok=True)
    else:
        for name in ('node-entry.cjs','node-suite-entry.cjs'):shutil.copyfile(ROOT/'demos/node'/name,payload/name)
    shutil.copyfile(bundle/'candidate.tgz',payload/'candidate.tgz')
    write(payload/'package.json',{'name':'vscode-deviceid-regression','version':'1.0.0','private':True,'main':'main.cjs','dependencies':{manifest['packageName']:'file:./candidate.tgz'}})
    # Deliberately ordinary installation: exercises the platform-gated installer.
    run(['npm','install','--omit=dev','--no-audit','--no-fund'],'npm-install.log',payload)
    shutil.copyfile(payload/'package-lock.json',output/'dependency-lock.json')
    package=payload/'node_modules'/manifest['packageName']
    for name,expected in manifest['packageFiles'].items():
        assert sha(package/name)==expected,'ordinary npm install changed '+name
    write(payload/'input.json',{k:manifest[k] for k in ('packageName','packageVersion','candidateSha256','packageFiles')})
    identity=read(payload/'input.json');identity['packageSha256']=identity.pop('candidateSha256');identity['host']=host
    write(payload/'input.json',identity)
    (payload/'candidate.tgz').unlink()
    module='entry' if host=='node' else 'electron'
    runtime_files={}
    if host=='electron':
        assert args.runtime_dir,'supply --runtime-dir'
        runtime=args.runtime_dir.resolve()
        libs=project/'electron/libs/arm64-v8a';libs.mkdir(parents=True)
        expected='8f865ffdd4eacea87da938f1676ffbb653fc1746120bbb43e06bb46b40576541'
        assert sha(runtime/'electron/libs/arm64-v8a/libelectron.so')==expected,'wrong Electron runtime'
        for name in ('libadapter.so','libelectron.so','libffmpeg.so','libc++_shared.so'):
            source=runtime/'electron/libs/arm64-v8a'/name
            shutil.copyfile(source,libs/name);runtime_files[name]=sha(source)
        resources=project/'web_engine/src/main/resources/resfile';resources.mkdir(parents=True,exist_ok=True)
        for item in (runtime/'web_engine/src/main/resources/resfile').iterdir():
            if item.name.startswith('._') or item.name=='resources':continue
            if item.is_dir():shutil.copytree(item,resources/item.name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('._*'))
            else:shutil.copyfile(item,resources/item.name)
        shutil.copytree(payload,resources/'resources/app',dirs_exist_ok=True)
        shutil.rmtree(project/'app-src')
    else:
        assert args.node_runtime,'supply --node-runtime'
        runtime=args.node_runtime.resolve()
        runtime_lock=read(ROOT/'demos/node/runtime.lock.json')
        pkg=scratch/'pkg';bin_dir=pkg/'bin';bin_dir.mkdir(parents=True)
        for name,expected in runtime_lock['files'].items():
            assert sha(runtime/name)==expected,'Node runtime input mismatch: '+name
            runtime_files[name]=expected
            dest=bin_dir/('ohportsdeviceidnode' if name=='node' else name)
            shutil.copyfile(runtime/name,dest);dest.chmod(0o755)
        shutil.copytree(payload,pkg/'scripts')
        write(pkg/'hnp.json',{'type':'hnp-config','name':'ohportsdeviceidnode','version':'1.0.0','install':{}})
        hnp=scratch/'ohportsdeviceidnode.hnp'
        with zipfile.ZipFile(hnp,'w',zipfile.ZIP_DEFLATED) as z:
            for item in sorted(pkg.rglob('*')):
                info=zipfile.ZipInfo('pkg/'+item.relative_to(pkg).as_posix()+('/' if item.is_dir() else ''))
                info.create_system=3;info.external_attr=(0o40755 if item.is_dir() else 0o100755)<<16;info.compress_type=zipfile.ZIP_DEFLATED
                z.writestr(info,b'' if item.is_dir() else item.read_bytes())
    run(['ohpm','install','--all'],'dependencies.log')
    run(['hvigorw','assembleHap','-p','product=default','-p','buildMode=debug','--no-daemon'],'build.log')
    unsigned=project/f'{module}/build/default/outputs/default/{module}-default-unsigned.hap'
    if host=='node':
        injected=scratch/'node-unsigned.hap'
        with zipfile.ZipFile(unsigned) as old,zipfile.ZipFile(injected,'w',zipfile.ZIP_DEFLATED) as new:
            for item in old.infolist():
                if not item.filename.endswith('.hnp'):new.writestr(item,old.read(item))
            new.write(hnp,'hnp/arm64-v8a/'+hnp.name)
        unsigned=injected
    run(['ohpt-agent','sign-demo','-w',scratch,'--demo-dir','project','--hap',unsigned,'--json'],'prepare-signing.log')
    material=project/'build/oh-signing';lib=args.sdk.resolve()/'default/openharmony/toolchains/lib';java=args.java_home.resolve()/'bin/java'
    signed=output/f'vscode-deviceid-{host}-signed.hap'
    run([java,'-jar',lib/'hap-sign-tool.jar','sign-app','-mode','localSign','-keyAlias','openharmony application release','-keyPwd','123456','-appCertFile',material/'app-chain.cer','-profileFile',material/'profile.p7b','-inFile',unsigned,'-signAlg','SHA256withECDSA','-keystoreFile',lib/'OpenHarmony.p12','-keystorePwd','123456','-outFile',signed,'-compatibleVersion','12','-signCode','1'],'sign.log')
    run([java,'-jar',lib/'hap-sign-tool.jar','verify-app','-inFile',signed,'-outCertChain',output/'chain.cer','-outProfile',output/'profile.p7b'],'verify-signature.log')
    with zipfile.ZipFile(signed) as hap:
        if host=='node':
            archive=zipfile.ZipFile(io.BytesIO(hap.read('hnp/arm64-v8a/ohportsdeviceidnode.hnp')))
            prefix='pkg/scripts/node_modules/'+manifest['packageName']+'/'
        else:
            archive=hap;prefix='resfile/resources/app/node_modules/'+manifest['packageName']+'/'
            # Harmony resource ZIP prefix is discovered rather than assumed.
            candidates=[n for n in hap.namelist() if n.endswith('/node_modules/'+manifest['packageName']+'/package.json')]
            assert len(candidates)==1,candidates
            prefix=candidates[0].removesuffix('package.json')
        for name,expected in manifest['packageFiles'].items():
            assert hashlib.sha256(archive.read(prefix+name)).hexdigest()==expected,'signed HAP changed '+name
    identity={**identity,'packageFiles':manifest['packageFiles'],'hapSha256':sha(signed),'signedHap':str(signed),'signatureVerified':True,'runtimeFiles':runtime_files}
    write(output/'identity.json',identity)
    if args.install:
        reply=run(['hdc','install',signed],'install.log')
        assert 'install bundle successfully' in reply,reply
    print(json.dumps(identity,indent=2))
    shutil.rmtree(scratch)


if __name__=='__main__':
    main()
