'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os'),crypto=require('crypto'),assert=require('assert');const config=require('./config.json');const {Worker}=require('worker_threads');
(async()=>{
 const root=path.dirname(path.dirname(require.resolve(config.packageName)));const pkg=await import(config.packageName);const results=[];
 const test=async(name,fn)=>{await fn();results.push({name,status:'passed'});};
 await test('frozen candidate file inventory',()=>{for(const [name,hash] of Object.entries(config.files))assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),hash,name);});
 await test('public ESM API and package identity',()=>{assert.deepStrictEqual(Object.keys(pkg),['rgPath']);const m=JSON.parse(fs.readFileSync(path.join(root,'package.json')));assert.strictEqual(m.name,config.packageName);assert.strictEqual(m.version,config.packageVersion);});
 await test('native optional dependency route on actual host',()=>assert.strictEqual(pkg.rgPath,require.resolve(`@vscode/ripgrep-${process.platform}-${process.arch}/bin/rg`)));
 const exec=(args,opt={})=>{const r=cp.spawnSync(pkg.rgPath,args,{encoding:'utf8',timeout:10000,...opt});if(r.error)throw r.error;return r;};
 await test('real host ripgrep version',()=>{const r=exec(['--version']);assert.strictEqual(r.status,0);assert.match(r.stdout,/^ripgrep \d+\./);});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rg-host-'));const file=path.join(temp,'with spaces.txt');fs.writeFileSync(file,'Hello Harmony\n中文测试\n');
 try{
  await test('real host regex search',()=>{const r=exec(['--no-config','^Hello [A-Z][a-z]+$',file]);assert.strictEqual(r.status,0);assert.strictEqual(r.stdout,'Hello Harmony\n');});
  await test('real host Unicode search',()=>{const r=exec(['--no-config','中文',file]);assert.strictEqual(r.status,0);assert.strictEqual(r.stdout,'中文测试\n');});
  await test('real host no-match and invalid-regex exits',()=>{assert.strictEqual(exec(['--no-config','absent',file]).status,1);assert.strictEqual(exec(['--no-config','[',file]).status,2);});
  await test('host Worker loads ESM, executes and exits',()=>new Promise((resolve,reject)=>{let message;const w=new Worker(`const {parentPort}=require('worker_threads');import(${JSON.stringify(config.packageName)}).then(m=>{const r=require('child_process').spawnSync(m.rgPath,['--version'],{encoding:'utf8'});if(r.error)throw r.error;parentPort.postMessage({status:r.status,text:r.stdout});});`,{eval:true});w.on('message',m=>message=m);w.on('error',reject);w.on('exit',code=>{try{assert.strictEqual(code,0);assert.strictEqual(message.status,0);assert.match(message.text,/^ripgrep \d+\./);resolve();}catch(e){reject(e);}});}));
  async function simulate(platform,arch,override,expected,error){
   const code=`Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});process.env.npm_config_arch=${JSON.stringify(arch)};${override===null?'delete process.env.VSCODE_RIPGREP_PATH;':'process.env.VSCODE_RIPGREP_PATH='+JSON.stringify(override)+';'}import(${JSON.stringify(config.packageName)}).then(m=>console.log(JSON.stringify({path:m.rgPath}))).catch(e=>{console.error(e.message);process.exitCode=2;});`;
   const r=cp.spawnSync(process.execPath,['-e',code],{cwd:__dirname,encoding:'utf8'});
   if(error){assert.strictEqual(r.status,2);assert.match(r.stderr,error);}else{assert.strictEqual(r.status,0,r.stderr);assert.strictEqual(JSON.parse(r.stdout).path,expected);}
  }
  await test('simulated ohos arm64 bundled route',()=>simulate('ohos','arm64',null,path.join(root,'bin/ohos-arm64/rg')));
  await test('simulated openharmony private HNP override',()=>simulate('openharmony','arm64','/private/hnp/bin/rg','/private/hnp/bin/rg'));
  await test('simulated invalid relative HNP override rejected',()=>simulate('ohos','arm64','relative/rg',null,/must be absolute/));
  await test('simulated unsupported Harmony architecture rejected',()=>simulate('openharmony','x64',null,null,/Unsupported HarmonyOS architecture/));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({kind:'host-and-explicit-platform-simulation',node:process.versions.node,platform:process.platform,arch:process.arch,total:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
