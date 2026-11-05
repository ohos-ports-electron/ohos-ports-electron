'use strict';
// Platform routing and filesystem failures are injected here. Device evidence is separate.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=process.env.MACHINE_ID_PACKAGE_ROOT;if(!root)throw Error('MACHINE_ID_PACKAGE_ROOT required');
const source=fs.readFileSync(path.join(root,'harmony.cjs'),'utf8');
function load(home,options={}){
 const fakeFs=Object.create(fs);
 fakeFs.readFileSync=(file,...args)=>{
  if(['/var/lib/dbus/machine-id','/etc/machine-id'].includes(file)){
   if(options.system&&options.system[file])return options.system[file];
   throw Object.assign(new Error('No system machine-id in model'),{code:'ENOENT'});
  }
  return fs.readFileSync(file,...args);
 };
 if(options.writeError)fakeFs.writeFileSync=()=>{throw Object.assign(new Error('injected write denial'),{code:'EACCES'});};
 if(options.linkError)fakeFs.linkSync=()=>{throw Object.assign(new Error('injected link denial'),{code:'EPERM'});};
 const module={exports:{}};const localProcess={pid:process.pid,env:{OHOS_MACHINE_ID_DIR:home}};
 const requireModel=name=>name==='fs'?fakeFs:name==='os'?{homedir:()=>home}:require(name);
 vm.runInNewContext('(function(require,module,process){'+source+'\n})',{},{filename:'harmony.cjs'})(requireModel,module,localProcess);
 return module.exports;
}
const temporary=body=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'machine-id-test-'));return Promise.resolve().then(()=>body(dir)).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));};
test('actual non-HarmonyOS public CJS and ESM APIs',async()=>{
 const m=require(root);assert.equal(typeof m.machineId,'function');assert.match(m.machineIdSync(),/^[a-f0-9]{64}$/);
 assert.equal(await m.machineId(),m.machineIdSync());const esm=await import(require('node:url').pathToFileURL(path.join(root,'index.mjs')));assert.equal(esm.machineIdSync(),m.machineIdSync());
});
test('simulated platform dispatcher preserves unchanged upstream on other platforms',()=>{
 const code=fs.readFileSync(path.join(root,'dist/index.js'),'utf8');
 for(const platform of ['ohos','openharmony','darwin','win32','linux','freebsd']){
  const module={exports:{}};let selected;
  vm.runInNewContext(code,{process:{platform},module,require:name=>{selected=name;return {};}});
  assert.equal(selected,['ohos','openharmony'].includes(platform)?'../harmony.cjs':'./upstream.cjs');
 }
});
test('real atomic file creation, SHA256, mode and fresh module persistence',()=>temporary(async dir=>{
 const m=load(dir),raw=m.machineIdSync(true);assert.match(raw,/^[a-f0-9]{32}$/);assert.equal(fs.statSync(path.join(dir,'.node-machine-id')).mode&0o777,0o600);
 assert.equal(m.machineIdSync(),crypto.createHash('sha256').update(raw).digest('hex'));assert.equal(await m.machineId(true),raw);assert.equal(load(dir).machineIdSync(true),raw);
 assert.deepEqual(fs.readdirSync(dir),['.node-machine-id']);
}));
test('distinct installations have independent random IDs',()=>temporary(async a=>temporary(async b=>{assert.notEqual(load(a).machineIdSync(true),load(b).machineIdSync(true));})));
test('legacy cache normalization and reuse',()=>temporary(async dir=>{fs.writeFileSync(path.join(dir,'.node-machine-id'),'A'.repeat(32)+'\n',{mode:0o600});assert.equal(load(dir).machineIdSync(true),'a'.repeat(32));}));
test('system files take priority and normalize',()=>temporary(async dir=>{const m=load(dir,{system:{'/var/lib/dbus/machine-id':'ABC 123\n','/etc/machine-id':'OTHER'}});assert.equal(m.machineIdSync(true),'abc123');assert.deepEqual(fs.readdirSync(dir),[]);}));
test('empty first system file falls through to second',()=>temporary(async dir=>{assert.equal(load(dir,{system:{'/var/lib/dbus/machine-id':' \n','/etc/machine-id':'XYZ\n'}}).machineIdSync(true),'xyz');}));
test('corrupt cache errors preserve data and reject asynchronously',()=>temporary(async dir=>{const file=path.join(dir,'.node-machine-id');fs.writeFileSync(file,'invalid');const m=load(dir);assert.throws(()=>m.machineIdSync(),/Invalid persisted/);await assert.rejects(m.machineId(),/Error while obtaining machine id/);assert.equal(fs.readFileSync(file,'utf8'),'invalid');}));
test('write denial never returns an ephemeral ID',()=>temporary(async dir=>{const m=load(dir,{writeError:true});assert.throws(()=>m.machineIdSync(),/denial/);await assert.rejects(m.machineId(),/denial/);assert.deepEqual(fs.readdirSync(dir),[]);}));
test('link failure cleans temporary data and reports error',()=>temporary(async dir=>{assert.throws(()=>load(dir,{linkError:true}).machineIdSync(),/denial/);assert.deepEqual(fs.readdirSync(dir),[]);}));
test('relative explicit directory is rejected',async()=>{assert.throws(()=>load('relative').machineIdSync(),/must be absolute/);});
test('missing explicit directory is rejected',()=>temporary(async dir=>{assert.throws(()=>load(path.join(dir,'missing')).machineIdSync(),/ENOENT/);}));
test('concurrent independent Worker initializations publish one ID',()=>temporary(async dir=>{
 const {Worker}=require('node:worker_threads');
 const code=`const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs'),vm=require('node:vm');const real=fs.readFileSync;const fake=Object.create(fs);fake.readFileSync=(f,...a)=>{if(f==='/var/lib/dbus/machine-id'||f==='/etc/machine-id')throw Object.assign(new Error('model'),{code:'ENOENT'});return real(f,...a)};const m={exports:{}};vm.runInNewContext('(function(require,module,process){'+workerData.source+'\\n})')((n)=>n==='fs'?fake:require(n),m,{pid:process.pid,env:{OHOS_MACHINE_ID_DIR:workerData.dir}});parentPort.postMessage(m.exports.machineIdSync(true));`;
 const values=await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{let value;const w=new Worker(code,{eval:true,workerData:{source,dir}});w.on('message',v=>value=v);w.on('error',reject);w.on('exit',code=>code?reject(new Error('Worker exit '+code)):resolve(value));})));
 assert.equal(new Set(values).size,1);assert.match(values[0],/^[a-f0-9]{32}$/);assert.equal(fs.readFileSync(path.join(dir,'.node-machine-id'),'utf8').trim(),values[0]);assert.deepEqual(fs.readdirSync(dir),['.node-machine-id']);
}));
