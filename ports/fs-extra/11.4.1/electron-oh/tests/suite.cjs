'use strict';
const native = require('fs');
const path = require('path');
const assert = require('assert');
const {pathToFileURL} = require('url');
const crypto = require('crypto');

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg,'package.json'),'utf8')).name,c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes={};for(const [rel,expected] of Object.entries(c.config.libraryFiles)){
      const actual=crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg,rel))).digest('hex');
      assert.strictEqual(actual,expected,rel);hashes[rel]=actual;
    }c.equal(Object.keys(hashes).length,Object.keys(c.config.libraryFiles).length);
  }],
  ['mkdirp Promise recursive', async c => {await c.fs.mkdirp(c.p('mkdir/a/b'));c.equal(native.statSync(c.p('mkdir/a/b')).isDirectory(),true);}],
  ['mkdirsSync idempotent alias', async c => {c.fs.mkdirsSync(c.p('mkdirsync/a'));c.fs.mkdirpSync(c.p('mkdirsync/a'));c.equal(native.statSync(c.p('mkdirsync/a')).isDirectory(),true);}],
  ['mkdirs callback', async c => {await c.callback('mkdirs',c.p('mkdircb/a'));c.equal(native.statSync(c.p('mkdircb/a')).isDirectory(),true);}],
  ['outputFile creates parents', async c => {await c.fs.outputFile(c.p('out/a.txt'),'hello 鸿蒙');c.equal(native.readFileSync(c.p('out/a.txt'),'utf8'),'hello 鸿蒙');}],
  ['outputFileSync Buffer', async c => {c.fs.outputFileSync(c.p('binary/a.bin'),Buffer.from([0,1,127,255]));c.equal([...native.readFileSync(c.p('binary/a.bin'))],[0,1,127,255]);}],
  ['outputFile callback', async c => {await c.callback('outputFile',c.p('outcb/a.txt'),'callback');c.equal(native.readFileSync(c.p('outcb/a.txt'),'utf8'),'callback');}],
  ['ensureFile preserves existing bytes', async c => {await c.fs.outputFile(c.p('ensure/a'),'keep');await c.fs.ensureFile(c.p('ensure/a'));await c.fs.ensureFile(c.p('ensure/b'));c.equal([native.readFileSync(c.p('ensure/a'),'utf8'),native.statSync(c.p('ensure/b')).size],['keep',0]);}],
  ['ensureFileSync creates parents', async c => {c.fs.ensureFileSync(c.p('ensuresync/a/b'));c.equal(native.statSync(c.p('ensuresync/a/b')).size,0);}],
  ['writeJson/readJson Promise options', async c => {const f=c.p('data.json');await c.fs.writeJson(f,{text:'鸿蒙',n:3},{spaces:2});c.equal(await c.fs.readJson(f),{text:'鸿蒙',n:3});assert(native.readFileSync(f,'utf8').includes('\n  "text"'));}],
  ['outputJsonSync/readJSONSync aliases', async c => {c.fs.outputJSONSync(c.p('jsonsync/a/x.json'),{ok:true});c.equal(c.fs.readJSONSync(c.p('jsonsync/a/x.json')),{ok:true});}],
  ['outputJson callback', async c => {await c.callback('outputJson',c.p('jsoncb/x.json'),[1,2]);c.equal(await c.callback('readJson',c.p('jsoncb/x.json')),[1,2]);}],
  ['readJson invalid input rejects', async c => {native.writeFileSync(c.p('bad.json'),'{oops');await assert.rejects(c.fs.readJson(c.p('bad.json')),SyntaxError);c.equal('SyntaxError','SyntaxError');}],
  ['readJson throws false returns null', async c => c.equal(await c.fs.readJson(c.p('bad.json'),{throws:false}),null)],
  ['copy directory Promise bytes', async c => {await c.fs.outputFile(c.p('copy/source/sub/a'),'A');await c.fs.outputFile(c.p('copy/source/b'),'B');await c.fs.copy(c.p('copy/source'),c.p('copy/dest'));c.equal([native.readFileSync(c.p('copy/dest/sub/a'),'utf8'),native.readFileSync(c.p('copy/dest/b'),'utf8')],['A','B']);}],
  ['copySync filter', async c => {c.fs.copySync(c.p('copy/source'),c.p('copy/filtered'),{filter:s=>!s.endsWith('/b')});c.equal([native.existsSync(c.p('copy/filtered/sub/a')),native.existsSync(c.p('copy/filtered/b'))],[true,false]);}],
  ['copy overwrite false preserves destination', async c => {await c.fs.outputFile(c.p('copy/existing'),'keep');await c.fs.copy(c.p('copy/source/b'),c.p('copy/existing'),{overwrite:false});c.equal(native.readFileSync(c.p('copy/existing'),'utf8'),'keep');}],
  ['copy errorOnExist rejects', async c => {await assert.rejects(c.fs.copy(c.p('copy/source/b'),c.p('copy/existing'),{overwrite:false,errorOnExist:true}));c.equal(native.readFileSync(c.p('copy/existing'),'utf8'),'keep');}],
  ['copy callback', async c => {await c.callback('copy',c.p('copy/source/b'),c.p('copy/callback'));c.equal(native.readFileSync(c.p('copy/callback'),'utf8'),'B');}],
  ['copy preserveTimestamps within 1ms', async c => {const s=c.p('time-source');native.writeFileSync(s,'time');native.utimesSync(s,1577836800.125,1577836800.125);await c.fs.copy(s,c.p('time-copy'),{preserveTimestamps:true});const delta=Math.abs(native.statSync(s).mtimeMs-native.statSync(c.p('time-copy')).mtimeMs);assert(delta<=1,'mtime delta='+delta);c.record('<=1 ms',delta);}],
  ['copy missing source ENOENT', async c => {await assert.rejects(c.fs.copy(c.p('absent-copy'),c.p('never')),{code:'ENOENT'});c.equal(native.existsSync(c.p('never')),false);}],
  ['copy cannot copy into itself', async c => {await assert.rejects(c.fs.copy(c.p('copy/source'),c.p('copy/source/nested')));c.equal(native.existsSync(c.p('copy/source/nested')),false);}],
  ['move Promise removes source', async c => {await c.fs.outputFile(c.p('move/source/a'),'move');await c.fs.move(c.p('move/source'),c.p('move/dest'));c.equal([native.existsSync(c.p('move/source')),native.readFileSync(c.p('move/dest/a'),'utf8')],[false,'move']);}],
  ['moveSync overwrite', async c => {native.writeFileSync(c.p('move-a'),'new');native.writeFileSync(c.p('move-b'),'old');c.fs.moveSync(c.p('move-a'),c.p('move-b'),{overwrite:true});c.equal([native.existsSync(c.p('move-a')),native.readFileSync(c.p('move-b'),'utf8')],[false,'new']);}],
  ['move callback', async c => {native.writeFileSync(c.p('move-c'),'cb');await c.callback('move',c.p('move-c'),c.p('move-d'));c.equal(native.readFileSync(c.p('move-d'),'utf8'),'cb');}],
  ['emptyDir retains directory', async c => {await c.fs.outputFile(c.p('empty/a/b'),'x');await c.fs.emptyDir(c.p('empty'));c.equal([native.statSync(c.p('empty')).isDirectory(),native.readdirSync(c.p('empty'))],[true,[]]);}],
  ['emptyDirSync creates missing directory', async c => {c.fs.emptyDirSync(c.p('empty-new'));c.equal(native.readdirSync(c.p('empty-new')),[]);}],
  ['pathExists and pathExistsSync', async c => c.equal([await c.fs.pathExists(c.p('data.json')),await c.fs.pathExists(c.p('not-found')),c.fs.pathExistsSync(c.p('data.json'))],[true,false,true])],
  ['remove Promise recursive and absent', async c => {await c.fs.outputFile(c.p('remove/a/b'),'x');await c.fs.remove(c.p('remove'));await c.fs.remove(c.p('remove'));c.equal(native.existsSync(c.p('remove')),false);}],
  ['removeSync and callback', async c => {c.fs.outputFileSync(c.p('remove-sync/a'),'x');c.fs.removeSync(c.p('remove-sync'));await c.callback('remove',c.p('remove-sync'));c.equal(native.existsSync(c.p('remove-sync')),false);}],
  ['native fs methods Promise and callback', async c => {await c.fs.writeFile(c.p('native'),'abc');const callback=await c.callback('readFile',c.p('native'),'utf8');c.equal([await c.fs.readFile(c.p('native'),'utf8'),callback],['abc','abc']);}],
  ['ensureLink missing source ENOENT', async c => {await assert.rejects(c.fs.ensureLink(c.p('link-absent'),c.p('link-target')),{code:'ENOENT'});c.equal(native.existsSync(c.p('link-target')),false);}],
  ['ensureSymlink missing source ENOENT', async c => {await assert.rejects(c.fs.ensureSymlink(c.p('sym-absent'),c.p('sym-target')),{code:'ENOENT'});c.equal(native.existsSync(c.p('sym-target')),false);}],
  ['link capability and native error propagation', async c => {
    const source=c.p('link-source');native.writeFileSync(source,'linked');const result={};
    for(const kind of ['link','symlink']){
      const n=c.p(kind+'-native');const dest=c.p(kind+'-extra');let nativeError=null;
      try{native[kind+'Sync'](source,n);}catch(e){nativeError=e;}
      if(nativeError){
        assert(['EACCES','EPERM'].includes(nativeError.code),String(nativeError));
        let extraError;try{await c.fs[kind==='link'?'ensureLink':'ensureSymlink'](source,dest);}catch(e){extraError=e;}
        assert(extraError,kind+' unexpectedly succeeded');assert.strictEqual(extraError.code,nativeError.code);
        result[kind]={supported:false,nativeError:nativeError.code,libraryError:extraError.code};
      }else{
        await c.fs[kind==='link'?'ensureLink':'ensureSymlink'](source,dest);
        assert.strictEqual(native.readFileSync(dest,'utf8'),'linked');
        if(kind==='link')assert.strictEqual(native.statSync(source).ino,native.statSync(dest).ino);
        else assert.strictEqual(native.lstatSync(dest).isSymbolicLink(),true);
        result[kind]={supported:true};
      }
    }c.record('native capability retained; identical OS error if denied',result);
  }],
  ['ESM exports real filesystem operation', async c => {const esm=await import(pathToFileURL(path.join(c.pkg,'lib/esm.mjs')).href);await esm.outputFile(c.p('esm/a'),'esm');c.equal(native.readFileSync(c.p('esm/a'),'utf8'),'esm');}],
  ['parallel output and explicit cleanup', async c => {await Promise.all([0,1,2,3].map(i=>c.fs.outputFile(c.p('parallel/'+i),String(i))));c.equal(native.readdirSync(c.p('parallel')).length,4);await c.fs.remove(c.p('parallel'));assert(!native.existsSync(c.p('parallel')));}],
];

async function run(config,outputDir){
  const startedAt=new Date().toISOString();const runId=crypto.randomBytes(12).toString('hex');
  const results=[];let fs,pkg;let loadError;
  try{fs=require(config.packageName);pkg=path.dirname(path.dirname(require.resolve(config.packageName)));}catch(e){loadError=e;}
  const root=path.join(outputDir,'fs-extra-'+process.pid+'-'+runId);native.mkdirSync(root,{recursive:true});
  for(const [name,body] of definitions){
    const start=Date.now();let expected=null,actual=null,status='passed',error=null;let assertions=0;
    const context={fs,pkg,config,p:s=>path.join(root,s),
      equal:(a,b)=>{expected=b;actual=a;assertions++;assert.deepStrictEqual(a,b);},
      record:(e,a)=>{expected=e;actual=a;assertions++;},
      callback:(method,...args)=>new Promise((resolve,reject)=>fs[method](...args,(e,value)=>e?reject(e):resolve(value)))};
    try{if(loadError)throw loadError;await body(context);assert(assertions>0,'case did not record an assertion');}catch(e){status='failed';error={name:e.name,code:e.code,message:e.message,stack:e.stack};}
    const result={name,status,expected,actual,durationMs:Date.now()-start,error};results.push(result);
    console.log('FSEXTRA_CASE '+JSON.stringify({runId,pid:process.pid,...result}));
  }
  let cleanupError=null;try{if(fs)await fs.remove(root);else native.rmSync(root,{recursive:true,force:true});}catch(e){cleanupError=String(e);}
  const report={runId,pid:process.pid,startedAt,finishedAt:new Date().toISOString(),packageSha256:config.packageSha256,
    packageName:config.packageName,packageVersion:config.packageVersion,phase:config.phase,targetId:config.targetId,
    versions:process.versions,platform:process.platform,arch:process.arch,expectedTotal:definitions.length,
    total:results.length,pass:results.filter(x=>x.status==='passed').length,fail:results.filter(x=>x.status==='failed').length,
    notRun:0,results,cleanupError};
  report.status=report.fail===0&&!cleanupError?'passed':'failed';
  const json=JSON.stringify(report,null,2);native.mkdirSync(outputDir,{recursive:true});
  native.writeFileSync(path.join(outputDir,runId+'.json.tmp'),json);native.renameSync(path.join(outputDir,runId+'.json.tmp'),path.join(outputDir,runId+'.json'));
  native.writeFileSync(path.join(outputDir,'latest.json.tmp'),json);native.renameSync(path.join(outputDir,'latest.json.tmp'),path.join(outputDir,'latest.json'));
  console.log('FSEXTRA_DONE '+JSON.stringify({runId,pid:process.pid,status:report.status,pass:report.pass,total:report.total}));return report;
}
module.exports={run,definitions};
