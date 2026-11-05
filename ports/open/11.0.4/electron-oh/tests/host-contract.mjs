// Host protocol model tests. process.platform is simulated; these are not device evidence.
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {ChildProcess, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
const nativeDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'open-native-launcher-'));
const nativeLauncher=path.join(nativeDirectory,'open-launcher');
execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror',path.join(process.env.OPEN_PACKAGE_ROOT,'harmony-host/open-launcher.c'),'-o',nativeLauncher],{cwd:new URL('.',import.meta.url)});
const platform=Object.getOwnPropertyDescriptor(process,'platform');
const electron=Object.getOwnPropertyDescriptor(process.versions,'electron');
const oldDirectory=process.env.OPEN_HARMONY_BRIDGE_DIR;
const oldLauncher=process.env.OPEN_HARMONY_LAUNCHER;
delete process.env.OPEN_HARMONY_LAUNCHER;
Object.defineProperty(process,'platform',{value:'openharmony',configurable:true});
const {default:open,openApp,apps}=await import(process.env.OPEN_PACKAGE_ROOT+'/index.js');
const {isHarmonyOS}=await import(process.env.OPEN_PACKAGE_ROOT+'/harmony.js');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'open-harmony-repair-'));
process.env.OPEN_HARMONY_BRIDGE_DIR=directory;
let running=true,hostError=null,completionError=null,hostVersion;
const requests=[];
const canceled=new Set(),pendingCompletions=new Set();
async function answer(request,suffix,response){const temp=path.join(directory,request.id+'.test.tmp');await fs.writeFile(temp,JSON.stringify(response));await fs.rename(temp,path.join(directory,request.id+suffix));}
const host=(async()=>{while(running){for(const name of await fs.readdir(directory)){
 if(name.endsWith('.cancel')){canceled.add(name.slice(0,36));await fs.rm(path.join(directory,name),{force:true});continue;}
 if(!name.endsWith('.request.json'))continue;
 const file=path.join(directory,name);let request;try{request=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
 await fs.rm(file,{force:true});requests.push(request);
 const response={version:hostVersion??request.version,id:request.id,ok:!hostError,phase:request.waitForResult?'accepted':'completed',...(hostError||{})};
 await answer(request,'.response.json',response);
 if(request.waitForResult&&!hostError){const error=completionError;const task=(async()=>{await delay(request.parameters?.delayMs??10);if(Date.now()>=request.resultDeadline||canceled.has(request.id))return;await answer(request,'.completion.json',{version:2,id:request.id,phase:'completed',ok:!error,...(error||{result:{resultCode:request.parameters?.resultCode??0,want:{parameters:request.parameters}}})});})();pendingCompletions.add(task);task.finally(()=>pendingCompletions.delete(task));}
 }await delay(5);}})();
after(async()=>{running=false;await host;await Promise.all(pendingCompletions);await fs.rm(directory,{recursive:true,force:true});await fs.rm(nativeDirectory,{recursive:true,force:true});Object.defineProperty(process,'platform',platform);if(electron)Object.defineProperty(process.versions,'electron',electron);else delete process.versions.electron;if(oldDirectory===undefined)delete process.env.OPEN_HARMONY_BRIDGE_DIR;else process.env.OPEN_HARMONY_BRIDGE_DIR=oldDirectory;if(oldLauncher===undefined)delete process.env.OPEN_HARMONY_LAUNCHER;else process.env.OPEN_HARMONY_LAUNCHER=oldLauncher;});
test('recognizes the real openharmony platform without environment flags',()=>assert.equal(isHarmonyOS(),true));
test('dispatches URL through host and returns no fabricated process',async()=>{assert.equal(await open('https://example.com'),undefined);assert.equal(requests.at(-1).kind,'url');});
test('routes apps.browser before unsupported desktop default-browser detection',async()=>{await open('https://example.com',{app:{name:apps.browser}});assert.equal(requests.at(-1).application,undefined);});
test('preserves specified app identity',async()=>{await open('https://example.com',{app:{name:'com.example.browser/MainAbility'}});assert.equal(requests.at(-1).application,'com.example.browser/MainAbility');});
test('dispatches app-only requests',async()=>{await openApp('com.example.app/MainAbility');assert.equal(requests.at(-1).kind,'app');});
test('passes native error code and message to caller',async()=>{hostError={code:'16000001',message:'The specified ability does not exist.'};try{await assert.rejects(openApp('com.example.missing/MainAbility'),{code:'16000001',message:hostError.message});}finally{hostError=null;}});
test('retains AggregateError with every named app failure',async()=>{hostError={code:'16000001',message:'Missing'};try{await assert.rejects(openApp(['com.example.one','com.example.two']),error=>error instanceof AggregateError&&error.errors.length===2&&error.errors.every(e=>e.code==='16000001'));}finally{hostError=null;}});
test('handles concurrent requests independently and cleans request files',async()=>{await Promise.all([open('https://example.com/a'),open('https://example.com/b')]);assert.deepEqual(await fs.readdir(directory),[]);});
test('missing file preserves ENOENT before host dispatch',async()=>assert.rejects(open(path.join(directory,'missing.png')),{code:'ENOENT'}));
test('real file URL becomes a local file path',async()=>{const file=path.join(directory,'proof.txt');await fs.writeFile(file,'proof');await open(new URL('file://'+file).href);assert.equal(requests.at(-1).target,file);await fs.rm(file);});
for(const options of [{wait:true},{app:{name:'browserPrivate'}},{app:{name:'com.example.app',arguments:['--flag']}}])test('unsupported option rejects instead of pretending success: '+JSON.stringify(options),async()=>assert.rejects(open('https://example.com',options),{code:'ERR_OPEN_HARMONY_UNSUPPORTED_OPTION'}));
test('macOS-only flags follow non-macOS semantics and do not prevent dispatch',async()=>{await open('https://example.com',{background:true,newInstance:true});assert.equal(requests.at(-1).target,'https://example.com');});
test('Huawei browser constant preserves the actual HarmonyOS application identity',()=>assert.equal(apps.huawei,'com.huawei.hmos.browser/MainAbility'));
test('native launcher really submits request and returns an observable ChildProcess',async()=>{
 process.env.OPEN_HARMONY_LAUNCHER=nativeLauncher;
 try{const child=await open('https://example.com/native');assert.ok(child instanceof ChildProcess);assert.ok(child.pid>0);process.kill(child.pid,0);assert.equal(requests.at(-1).target,'https://example.com/native');const [code,signal]=await once(child,'exit');assert.equal(code,0);assert.equal(signal,null);}finally{delete process.env.OPEN_HARMONY_LAUNCHER;}
});
test('native launcher preserves the real host error and cleans up IPC files',async()=>{
 process.env.OPEN_HARMONY_LAUNCHER=nativeLauncher;hostError={code:'16000001',message:'Actual host rejection'};
 try{await assert.rejects(openApp('com.example.missing'),hostError);assert.deepEqual(await fs.readdir(directory),[]);}finally{hostError=null;delete process.env.OPEN_HARMONY_LAUNCHER;}
});
test('missing launcher rejects ENOENT without submitting a request',async()=>{
 const count=requests.length;process.env.OPEN_HARMONY_LAUNCHER=path.join(nativeDirectory,'missing');
 try{await assert.rejects(open('https://example.com'),{code:'ENOENT'});assert.equal(requests.length,count);assert.deepEqual(await fs.readdir(directory),[]);}finally{delete process.env.OPEN_HARMONY_LAUNCHER;}
});
test('explicit executable receives exact argv without shell interpretation and wait observes exit',async()=>{
 const output=path.join(directory,'argv.json');const args=['空 格','a;$(not-a-command)','"quoted"',''];
 const script='require("node:fs").writeFileSync(process.argv[1],JSON.stringify(process.argv.slice(2)))';
 const child=await openApp(process.execPath,{arguments:['-e',script,output,...args],wait:true,background:true,newInstance:true});
 assert.ok(child instanceof ChildProcess);assert.equal(child.exitCode,0);assert.deepEqual(JSON.parse(await fs.readFile(output)),args);await fs.rm(output);
});
test('executable nonzero exit rejects unless explicitly allowed',async()=>{
 await assert.rejects(openApp(process.execPath,{arguments:['-e','process.exit(7)'],wait:true}),{message:'Exited with code 7'});
 const child=await openApp(process.execPath,{arguments:['-e','process.exit(7)'],wait:true,allowNonzeroExitCode:true});assert.equal(child.exitCode,7);
});
test('executable fallback detects nonzero launcher exit before trying next app',async()=>{
 const child=await openApp(['/usr/bin/false','/usr/bin/true']);assert.ok(child instanceof ChildProcess);assert.equal(child.exitCode,0);
});
test('wait with an app array still respects allowNonzeroExitCode',async()=>{
 const child=await openApp([process.execPath],{arguments:['-e','process.exit(7)'],wait:true,allowNonzeroExitCode:true});assert.equal(child.exitCode,7);
});
test('retains synchronous public argument validation',()=>{assert.throws(()=>open(4),TypeError);assert.throws(()=>openApp(4),TypeError);assert.throws(()=>openApp('app',{arguments:'--x'}),TypeError);});
test('Electron shell.openPath error string rejects, native shell error preserved',async()=>{
 delete process.env.OPEN_HARMONY_BRIDGE_DIR;Object.defineProperty(process.versions,'electron',{value:'37.2.0',configurable:true});
 const file=path.join(directory,'fixture.txt');await fs.writeFile(file,'fixture');
 const load=Module._load;const calls=[];
 Module._load=function(id,...args){if(id==='electron')return {shell:{async openPath(p){calls.push(p);return 'Native open failed';},async openExternal(){throw Object.assign(Error('Native URL rejected'),{code:'NATIVE_URL'});}}};return load.call(this,id,...args);};
 try{
  await assert.rejects(open(file),{code:'ERR_OPEN_HARMONY_OPEN_FAILED',message:'Native open failed'});
  await assert.rejects(open('custom:target'),{code:'NATIVE_URL',message:'Native URL rejected'});
  await assert.rejects(open('https://example.com',{app:{name:'com.example.app'}}),{code:'ERR_OPEN_HARMONY_HOST_REQUIRED'});
  assert.deepEqual(calls,[file]);
 }finally{Module._load=load;process.env.OPEN_HARMONY_BRIDGE_DIR=directory;await fs.rm(file);}
});

test('Ability parameters preserve exact JSON values in an immutable request snapshot',async()=>{
 const parameters={payload:{text:'空 格',n:7,yes:true,nested:{strings:['quote"',''],numbers:[0,3.5,-1],flags:[false,true]}}};
 await openApp('com.example.app/EchoAbility',{harmony:{parameters}});
 assert.equal(requests.at(-1).version,2);assert.deepEqual(requests.at(-1).parameters,parameters);
});
test('Ability arguments map only through the explicitly agreed Want key',async()=>{
 const args=['空 格','"quoted"','a;$(not-a-command)',''];await openApp('com.example.app/EchoAbility',{arguments:args,harmony:{parameters:{token:'proof'},argumentsParameter:'argv'}});
 assert.deepEqual(requests.at(-1).parameters,{token:'proof',argv:args});
 await assert.rejects(openApp('com.example.app',{arguments:args,harmony:{parameters:{argv:[]},argumentsParameter:'argv'}}),{code:'ERR_OPEN_HARMONY_INVALID_OPTION'});
});
test('lossy or invalid Ability parameter values reject before dispatch',async()=>{
 const cycle={};cycle.self=cycle;const hole=new Array(2);const before=requests.length;
 for(const parameters of [{x:undefined},{x:NaN},{x:new Date()},{x:()=>0},{x:hole},{x:null},{x:[null,false,3,'']},{x:[]},{x:[{}]},{x:-0},cycle,null])await assert.rejects(openApp('com.example.app',{harmony:{parameters}}),{code:'ERR_OPEN_HARMONY_INVALID_OPTION'});
 assert.equal(requests.length,before);
});
test('cooperative result preserves actual business resultCode and onResult',async()=>{
 let result,calls=0;const start=Date.now();const child=await openApp('com.example.app/ResultAbility',{harmony:{parameters:{token:'result',delayMs:120,resultCode:7},waitForResult:true,onResult:value=>{result=value;calls++;}}});
 assert.equal(child,undefined);assert.equal(calls,1);assert.equal(result.resultCode,7);assert.equal(result.want.parameters.token,'result');assert.ok(Date.now()-start>=120);
});
test('native launcher is released before a long cooperative result wait',async()=>{
 process.env.OPEN_HARMONY_LAUNCHER=nativeLauncher;let result;
 try{const start=Date.now();const child=await openApp('com.example.app/ResultAbility',{harmony:{parameters:{delayMs:5500,resultCode:3},waitForResult:true,onResult:value=>{result=value;}}});assert.ok(child instanceof ChildProcess);assert.equal(child.exitCode,0);assert.equal(result.resultCode,3);assert.ok(Date.now()-start>=5500);}finally{delete process.env.OPEN_HARMONY_LAUNCHER;}
});
test('pending cooperative waits do not serialize unrelated opens or other results',async()=>{
 let slowResult,fastResult;const done=[];
 const slow=openApp('com.example.app/ResultAbility',{harmony:{parameters:{delayMs:200,token:'slow'},waitForResult:true,onResult:r=>{slowResult=r;done.push('slow');}}});
 const fast=openApp('com.example.app/ResultAbility',{harmony:{parameters:{delayMs:10,token:'fast'},waitForResult:true,onResult:r=>{fastResult=r;done.push('fast');}}});
 await open('https://example.com/concurrent');await Promise.all([slow,fast]);assert.deepEqual(done,['fast','slow']);assert.equal(slowResult.want.parameters.token,'slow');assert.equal(fastResult.want.parameters.token,'fast');
});
test('result timeout abandons waiting and suppresses late result files',async()=>{
 await assert.rejects(openApp('com.example.app/ResultAbility',{harmony:{parameters:{delayMs:300},waitForResult:true,resultTimeout:100}}),{code:'ERR_OPEN_HARMONY_RESULT_TIMEOUT'});
 await delay(400);assert.deepEqual(await fs.readdir(directory),[]);
});
test('completion-phase SDK error payload rejects without calling onResult',async()=>{
 completionError={code:'16000001',message:'Target Ability missing'};let called=false;
 try{await assert.rejects(openApp('com.example.missing/ResultAbility',{harmony:{waitForResult:true,onResult:()=>{called=true;}}}),completionError);assert.equal(called,false);}finally{completionError=null;await delay(30);}
});
test('legacy host cannot silently ignore protocol 2 parameters',async()=>{
 hostVersion=1;try{await assert.rejects(openApp('com.example.app',{harmony:{parameters:{proof:true}}}),{code:'ERR_OPEN_HARMONY_PROTOCOL'});}finally{hostVersion=undefined;}
});
test('onResult errors propagate after cleaning completion files',async()=>{
 await assert.rejects(openApp('com.example.app/ResultAbility',{harmony:{waitForResult:true,onResult:()=>{throw Error('consumer callback failed');}}}),{message:'consumer callback failed'});assert.deepEqual(await fs.readdir(directory),[]);
});
test('HarmonyOS-only options reject on another platform before desktop launch',async()=>{
 Object.defineProperty(process,'platform',{value:'darwin',configurable:true});try{await assert.rejects(openApp('com.example.app',{harmony:{parameters:{a:1}}}),{code:'ERR_OPEN_HARMONY_PLATFORM'});}finally{Object.defineProperty(process,'platform',{value:'openharmony',configurable:true});}
});

test('cooperative result requests reject ambiguous application fallback',async()=>{await assert.rejects(openApp(['com.example.one','com.example.two'],{harmony:{waitForResult:true}}),error=>error instanceof AggregateError&&error.errors.every(e=>e.code==='ERR_OPEN_HARMONY_INVALID_OPTION'));});
