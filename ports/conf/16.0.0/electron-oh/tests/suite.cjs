'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const definitions=[
 ['package identity',async c=>{const m=JSON.parse(fs.readFileSync(path.join(c.pkg,'package.json')));c.equal([m.name,m.version],[c.config.packageName,c.config.packageVersion]);}],
 ['distributed code integrity',async c=>{for(const [name,expected] of Object.entries(c.config.libraryFiles))assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(c.pkg,name))).digest('hex'),expected,name);c.equal(Object.keys(c.config.libraryFiles).length>0,true);}],
 ['create and read actual JSON file',async c=>{const s=c.store();s.set('hello','鸿蒙');c.equal([path.isAbsolute(s.path),JSON.parse(fs.readFileSync(s.path,'utf8')).hello],[true,'鸿蒙']);}],
 ['scalar and collection values',async c=>{const s=c.store();const v={string:'s',number:42,bool:false,none:null,list:[1,'x'],object:{a:1}};s.set(v);c.equal({...s.store},v);}],
 ['disk persistence after reopen',async c=>{const s=c.store();s.set('persist',{count:2});const again=new c.Conf({cwd:path.dirname(s.path)});c.equal(again.get('persist'),{count:2});}],
 ['missing get and fallback',async c=>{const s=c.store();c.equal([s.get('absent')===undefined,s.get('absent','fallback')],[true,'fallback']);}],
 ['has delete and size',async c=>{const s=c.store();s.set({one:1,two:2});s.delete('one');c.equal([s.has('one'),s.has('two'),s.size],[false,true,1]);}],
 ['whole store replacement and iteration',async c=>{const s=c.store();s.set('old',1);s.store={a:2,b:3};c.equal([s.has('old'),[...s]],[false,[['a',2],['b',3]]]);}],
 ['nested dotted and array index paths',async c=>{const s=c.store();s.set('user.name','Ada');s.set('items.0',10);c.equal([s.get('user.name'),s.get('items.0')],['Ada',10]);}],
 ['dot notation disabled',async c=>{const s=c.store({accessPropertiesByDotNotation:false});s.set('a.b',3);c.equal([s.get('a.b'),s.get('a')===undefined],[3,true]);}],
 ['defaults and reset',async c=>{const s=c.store({defaults:{theme:'light',count:1}});s.set('theme','dark');s.reset('theme');c.equal([s.get('theme'),s.get('count')],['light',1]);}],
 ['clear restores defaults',async c=>{const s=c.store({defaults:{a:1}});s.set({a:2,b:3});s.clear();c.equal({...s.store},{a:1});}],
 ['schema defaults and valid write',async c=>{const s=c.store({schema:{port:{type:'integer',default:80,minimum:1}}});s.set('port',443);c.equal(s.get('port'),443);}],
 ['schema rejects invalid without corrupting value',async c=>{const s=c.store({schema:{port:{type:'integer',default:80}}});assert.throws(()=>s.set('port','bad'));c.equal(s.get('port'),80);}],
 ['JSON schema format validation',async c=>{const s=c.store({schema:{email:{type:'string',format:'email'}}});assert.throws(()=>s.set('email','invalid'));s.set('email','a@example.com');c.equal(s.get('email'),'a@example.com');}],
 ['clear invalid JSON when requested',async c=>{const s=c.store();fs.writeFileSync(s.path,'{broken');const r=new c.Conf({cwd:path.dirname(s.path),clearInvalidConfig:true});c.equal({...r.store},{});}],
 ['corrupt JSON is reported by default',async c=>{const s=c.store();fs.writeFileSync(s.path,'{broken');let e;try{new c.Conf({cwd:path.dirname(s.path)});}catch(error){e=error;}c.equal(!!e,true);}],
 ['custom serialize deserialize',async c=>{const opts={serialize:v=>'PREFIX'+JSON.stringify(v),deserialize:s=>JSON.parse(s.slice(6))};const s=c.store(opts);s.set('x',9);const r=new c.Conf({...opts,cwd:path.dirname(s.path)});c.equal([fs.readFileSync(s.path,'utf8').startsWith('PREFIX'),r.get('x')],[true,9]);}],
 ['AES CBC encrypted disk roundtrip',async c=>{const s=c.store({encryptionKey:'secret-key'});s.set('secret','private-marker');const r=new c.Conf({cwd:path.dirname(s.path),encryptionKey:'secret-key'});c.equal([fs.readFileSync(s.path).includes(Buffer.from('private-marker')),r.get('secret')],[false,'private-marker']);}],
 ['AES GCM authenticated roundtrip',async c=>{const s=c.store({encryptionKey:'secret-key',encryptionAlgorithm:'aes-256-gcm'});s.set('key','gcm');const r=new c.Conf({cwd:path.dirname(s.path),encryptionKey:'secret-key',encryptionAlgorithm:'aes-256-gcm'});c.equal(r.get('key'),'gcm');}],
 ['wrong encryption key rejects',async c=>{const s=c.store({encryptionKey:'correct',encryptionAlgorithm:'aes-256-gcm'});s.set('secret',1);let e;try{new c.Conf({cwd:path.dirname(s.path),encryptionKey:'incorrect',encryptionAlgorithm:'aes-256-gcm'});}catch(error){e=error;}c.equal(!!e,true);}],
 ['migrations run once and persist version',async c=>{const opts={projectVersion:'1.0.0',migrations:{'1.0.0':s=>s.set('count',(s.get('count')||0)+1)}};const seed=c.store();seed.set('existing',true);const s=new c.Conf({...opts,cwd:path.dirname(seed.path)});const r=new c.Conf({...opts,cwd:path.dirname(s.path)});c.equal(r.get('count'),1);}],
 ['migrations apply in semantic version order',async c=>{const seed=c.store();seed.set('existing',true);const s=new c.Conf({cwd:path.dirname(seed.path),projectVersion:'2.0.0',migrations:{'2.0.0':s=>s.set('order',s.get('order')+'b'),'1.0.0':s=>s.set('order','a')}});c.equal(s.get('order'),'ab');}],
 ['onDidChange carries new old and unsubscribe',async c=>{const s=c.store();const seen=[];const off=s.onDidChange('a',(value,old)=>seen.push([value,old===undefined?null:old]));s.set('a',1);s.set('a',2);off();s.set('a',3);c.equal(seen,[[1,null],[2,1]]);}],
 ['onDidAnyChange fires and can unsubscribe',async c=>{const s=c.store();let count=0;const off=s.onDidAnyChange(()=>count++);s.set('a',1);s.delete('a');off();s.set('a',2);c.equal(count,2);}],
 ['watch observes external atomic change and closes',async c=>{const s=c.store({watch:true});await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{off();reject(Error('external change timeout'));},7000);const off=s.onDidChange('external',v=>{if(v===7){clearTimeout(timeout);off();resolve();}});setTimeout(()=>fs.writeFileSync(s.path,JSON.stringify({external:7})),150);});s._closeWatcher();c.equal(s.get('external'),7);}],
 ['invalid value types and circular data reject',async c=>{const s=c.store();for(const v of [undefined,()=>{},Symbol('x'),1n])assert.throws(()=>s.set('bad',v));const loop={};loop.self=loop;assert.throws(()=>s.set('loop',loop));c.equal(s.has('bad'),false);}],
 ['non string keys reject',async c=>{const s=c.store();assert.throws(()=>s.set(42,'x'),TypeError);assert.throws(()=>s.get(42),TypeError);c.equal(s.size,0);}],
 ['prototype pollution keys cannot modify Object prototype',async c=>{const s=c.store();try{s.set('__proto__.polluted','yes');}catch{}c.equal({}.polluted===undefined,true);}],
 ['invalid configuration options reject',async c=>{for(const opts of [{configFileMode:-1},{configFileMode:'0o644'},{encryptionAlgorithm:'unknown'},{migrations:{'1.0.0':42},projectVersion:'1.0.0'}])assert.throws(()=>c.store(opts));c.equal(true,true);}],
 ['custom name extension and writable directory',async c=>{const s=c.store({configName:'settings',fileExtension:'dat'});s.set('a',1);c.equal(path.basename(s.path),'settings.dat');}],
 ['atomic updates keep parseable disk and no temp leftovers',async c=>{const s=c.store();for(let i=0;i<10;i++)s.set('counter',i);c.equal([JSON.parse(fs.readFileSync(s.path,'utf8')).counter,fs.readdirSync(path.dirname(s.path))],[9,['config.json']]);}],
 ['store read copy cannot mutate persisted data',async c=>{const s=c.store();s.set('obj',{n:1});const copy=s.store;copy.obj.n=99;c.equal(s.get('obj.n'),1);}],
 ['Worker ESM persistence roundtrip and clean exit',async c=>{const {Worker}=require('node:worker_threads');let message;const code=await new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{packageName:c.config.packageName,cwd:c.p('worker')}});w.on('message',m=>message=m);w.on('error',reject);w.on('exit',resolve);});c.equal([code,message&&message.value],[0,'worker 鸿蒙']);}],
 ['_closeWatcher releases watcher for subsequent instance',async c=>{const s=c.store({watch:true});s.set('a',1);s._closeWatcher();const r=new c.Conf({cwd:path.dirname(s.path)});r.set('a',2);c.equal(r.get('a'),2);}],
];
async function run(config,outputDir){
 const startedAt=new Date().toISOString(),runId=crypto.randomBytes(12).toString('hex');const results=[];let Conf,pkg,loadError;
 try{const entry=require.resolve(config.packageName);pkg=path.resolve(path.dirname(entry),'../..');Conf=(await import(pathToFileURL(entry).href)).default;}catch(e){loadError=e;}
 const root=path.join(outputDir,'work-'+process.pid+'-'+runId);fs.mkdirSync(root,{recursive:true});let sequence=0;
 for(const [name,body] of definitions){const start=Date.now();let expected=null,actual=null,status='passed',error=null,assertions=0;const stores=[];
 const context={Conf,pkg,config,p:s=>path.join(root,s),store:opts=>{const s=new Conf({cwd:path.join(root,'case-'+(++sequence)),...opts});stores.push(s);return s;},equal:(a,b)=>{expected=b;actual=a;assertions++;assert.deepStrictEqual(a,b);}};
 try{if(loadError)throw loadError;await body(context);assert(assertions>0,'missing recorded assertion');}catch(e){status='failed';error={name:e.name,code:e.code,message:e.message,stack:e.stack};}
 finally{for(const s of stores)try{s._closeWatcher();}catch{}}
 const result={name,status,expected,actual,durationMs:Date.now()-start,error};results.push(result);console.log('CONFPORT_CASE '+JSON.stringify({runId,pid:process.pid,...result}));}
 let cleanupError=null;try{fs.rmSync(root,{recursive:true,force:true});}catch(e){cleanupError=String(e);}
 const report={runId,pid:process.pid,startedAt,finishedAt:new Date().toISOString(),packageSha256:config.packageSha256,packageName:config.packageName,packageVersion:config.packageVersion,phase:config.phase,targetId:config.targetId,versions:process.versions,platform:process.platform,arch:process.arch,expectedTotal:definitions.length,total:results.length,pass:results.filter(x=>x.status==='passed').length,fail:results.filter(x=>x.status==='failed').length,notRun:0,results,cleanupError};report.status=report.fail===0&&!cleanupError?'passed':'failed';
 const json=JSON.stringify(report,null,2);fs.mkdirSync(outputDir,{recursive:true});for(const name of [runId+'.json','latest.json']){fs.writeFileSync(path.join(outputDir,name+'.tmp'),json);fs.renameSync(path.join(outputDir,name+'.tmp'),path.join(outputDir,name));}console.log('CONFPORT_DONE '+JSON.stringify({runId,pid:process.pid,status:report.status,pass:report.pass,total:report.total}));return report;
}
module.exports={run,definitions};
