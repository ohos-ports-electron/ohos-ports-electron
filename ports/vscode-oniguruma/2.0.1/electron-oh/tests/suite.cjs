'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const reference=require('./reference-cases.cjs');
const referenceNames=['simple1','simple2','unicode1','unicode2','unicode3','unicode4','out of bounds','regex with \\G','kkos/oniguruma#192','FindOption.NotBeginPosition','FindOption.NotBeginString','FindOption.NotEndString','Configure scanner','Configure syntax','Throw error','gen-loadWASM-data','gen-loadWASM-repeat','gen-OnigString-dispose','gen-OnigScanner-dispose','gen-setDefaultDebugCall'];
const names=['package identity','distributed code integrity','engine initialization',...referenceNames,...['options','instantiator','response'].map(m=>'Worker '+m+' input and clean exit')];
async function run(config,outputDir){
 const startedAt=new Date().toISOString(),runId=crypto.randomBytes(12).toString('hex'),results=[];let onig,release,pkg,loadError,initError,cases;
 try{onig=require(config.packageName);release=path.dirname(require.resolve(config.packageName));pkg=path.dirname(release);cases=reference(release);}catch(e){loadError=e;}
 const definitions=[
  ['package identity',async c=>{const m=JSON.parse(fs.readFileSync(path.join(pkg,'package.json')));c.equal([m.name,m.version],[config.packageName,config.packageVersion]);}],
  ['distributed code integrity',async c=>{for(const [name,expected] of Object.entries(config.libraryFiles)){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(pkg,name))).digest('hex');assert.strictEqual(actual,expected,name);}c.equal(Object.keys(config.libraryFiles).length>0,true);}],
  ['engine initialization',async c=>{try{const b=fs.readFileSync(path.join(release,'onig.wasm'));await onig.loadWASM(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));c.equal(typeof onig.createOnigScanner,'function');}catch(e){initError=e;throw e;}}],
  ...referenceNames.map(name=>[name,async c=>{await cases[name]({check:(index,ok,actual,expected)=>{c.record(expected,actual);assert(ok,'check '+index+': '+actual+' expected '+expected);}});}]),
  ...['options','instantiator','response'].map(mode=>['Worker '+mode+' input and clean exit',async c=>{
   const {Worker}=require('worker_threads');const message=await new Promise((resolve,reject)=>{let reply;const worker=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{packageName:config.packageName,mode}});const timer=setTimeout(()=>{worker.terminate();reject(Error('worker timeout'));},20000);worker.on('message',m=>{reply=m;});worker.on('error',e=>{clearTimeout(timer);reject(e);});worker.on('exit',code=>{clearTimeout(timer);if(code||!reply)reject(Error('worker exit '+code));else resolve(reply);});});
   c.equal([message.result.captureIndices[0],message.exitReady,message.customCalled],[{start:2,end:6,length:4},true,mode==='instantiator']);
   if(mode==='response')c.equal(message.responseProvider,typeof WebAssembly==='object'?'native':'node-fetch@2.7.0');
  }]),
 ];
 for(const [name,body] of definitions){const start=Date.now();let expected=null,actual=null,status='passed',error=null,count=0,checks=[];
  const context={equal:(a,b)=>{expected=b;actual=a;count++;checks.push({expected:b,actual:a});assert.deepStrictEqual(a,b);},record:(e,a)=>{expected=e;actual=a;count++;checks.push({expected:e,actual:a});}};
  try{if(loadError)throw loadError;if(initError&&name!=='engine initialization'){status='not-run';error={message:'engine initialization failed: '+initError.message};}else{await body(context);assert(count>0,'no recorded assertion');}}
  catch(e){status='failed';error={name:e.name,code:e.code,message:e.message,stack:e.stack};}
  const result={name,status,expected:checks.length>1?checks.map(x=>x.expected):expected,actual:checks.length>1?checks.map(x=>x.actual):actual,durationMs:Date.now()-start,error};results.push(result);console.log('ONIGPORT_CASE '+JSON.stringify({runId,pid:process.pid,...result}));
 }
 const report={runId,pid:process.pid,startedAt,finishedAt:new Date().toISOString(),packageSha256:config.packageSha256,packageName:config.packageName,packageVersion:config.packageVersion,phase:config.phase,targetId:config.targetId,versions:process.versions,platform:process.platform,arch:process.arch,backend:typeof WebAssembly==='object'?'wasm':'asm.js',expectedTotal:names.length,total:results.length,pass:results.filter(x=>x.status==='passed').length,fail:results.filter(x=>x.status==='failed').length,notRun:results.filter(x=>x.status==='not-run').length,results};report.status=report.fail===0&&report.notRun===0?'passed':'failed';
 fs.mkdirSync(outputDir,{recursive:true});const json=JSON.stringify(report,null,2);for(const name of [runId+'.json','latest.json']){fs.writeFileSync(path.join(outputDir,name+'.tmp'),json);fs.renameSync(path.join(outputDir,name+'.tmp'),path.join(outputDir,name));}
 console.log('ONIGPORT_DONE '+JSON.stringify({runId,pid:process.pid,status:report.status,pass:report.pass,total:report.total,notRun:report.notRun}));return report;
}
module.exports={run,names};
