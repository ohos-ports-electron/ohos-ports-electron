'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
let rx,config;
const values=s=>rx.lastValueFrom(s.pipe(rx.toArray(),rx.timeout(2500)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cases=[];
function test(name,expected,fn){cases.push({name,expected,fn});}
test('installed package identity and complete file hashes',true,()=>{
 const root=path.dirname(require.resolve(config.packageName+'/package.json'));
 const meta=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 return meta.name===config.packageName&&meta.version===config.packageVersion&&Object.entries(config.libraryFiles).every(([f,h])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')===h);
});
test('of map filter pipeline',[4,6],()=>values(rx.of(1,2,3).pipe(rx.map(x=>x*2),rx.filter(x=>x>2))));
test('from iterable and Promise',[[1,2,3],[42]],async()=>[await values(rx.from(new Set([1,2,3]))),await values(rx.from(Promise.resolve(42)))]);
test('reduce and count',[[10],[5]],async()=>[await values(rx.of(1,2,3,4).pipe(rx.reduce((a,b)=>a+b,0))),await values(rx.range(0,5).pipe(rx.count()))]);
test('take and take zero',[[1,2],[]],async()=>[await values(rx.of(1,2,3).pipe(rx.take(2))),await values(rx.of(1).pipe(rx.take(0)))]);
test('skip and takeWhile',[3,4],()=>values(rx.of(1,2,3,4,5).pipe(rx.skip(2),rx.takeWhile(x=>x<5))));
test('concat preserves order',[1,2,3,4],()=>values(rx.concat(rx.of(1,2),rx.of(3,4))));
test('mergeMap emits every inner value',[10,20,30,100,200,300],async()=>(await values(rx.of(1,2,3).pipe(rx.mergeMap(x=>rx.of(x*10,x*100))))).sort((a,b)=>a-b));
test('concatMap serializes asynchronous inners',[1,2,3],()=>values(rx.of(1,2,3).pipe(rx.concatMap(x=>rx.of(x).pipe(rx.delay(5))))));
test('switchMap cancels previous inner',[3],()=>values(rx.of(1,2,3).pipe(rx.switchMap(x=>rx.of(x).pipe(rx.delay(10))))));
test('exhaustMap ignores concurrent inner',[1],()=>values(rx.of(1,2,3).pipe(rx.exhaustMap(x=>rx.of(x).pipe(rx.delay(10))))));
test('combineLatest latest values',[[2,'a'],[2,'b']],()=>values(rx.combineLatest([rx.of(1,2),rx.of('a','b')])));
test('forkJoin completion values',[[2,4]],()=>values(rx.forkJoin([rx.of(1,2),rx.of(3,4)])));
test('zip pairs corresponding emissions',[[1,'a'],[2,'b']],()=>values(rx.zip(rx.of(1,2),rx.of('a','b'))));
test('race keeps first emitting source',[1,2],()=>values(rx.race(rx.of(1,2),rx.timer(100))));
test('scan accumulation',[1,3,6],()=>values(rx.of(1,2,3).pipe(rx.scan((a,b)=>a+b,0))));
test('distinctUntilChanged',[1,2,3],()=>values(rx.of(1,1,2,2,3).pipe(rx.distinctUntilChanged())));
test('bufferCount groups emissions',[[1,2],[3,4],[5]],()=>values(rx.of(1,2,3,4,5).pipe(rx.bufferCount(2))));
test('pairwise adjacent values',[[1,2],[2,3]],()=>values(rx.of(1,2,3).pipe(rx.pairwise())));
test('Subject multicast and completed late subscriber',[[1,2],[1,2],true],()=>{const s=new rx.Subject(),a=[],b=[];s.subscribe(x=>a.push(x));s.subscribe(x=>b.push(x));s.next(1);s.next(2);s.complete();let done=false;s.subscribe({complete(){done=true;}});return[a,b,done];});
test('BehaviorSubject current value',['b'],()=>{const s=new rx.BehaviorSubject('init');s.next('a');s.next('b');const a=[];const sub=s.subscribe(x=>a.push(x));sub.unsubscribe();s.complete();return a;});
test('ReplaySubject bounded history',[2,3],()=>{const s=new rx.ReplaySubject(2);s.next(1);s.next(2);s.next(3);s.complete();const a=[];s.subscribe(x=>a.push(x));return a;});
test('AsyncSubject emits only last on completion',[[],[3]],()=>{const s=new rx.AsyncSubject(),a=[];s.subscribe(x=>a.push(x));s.next(1);s.next(3);const before=a.slice();s.complete();return[before,a];});
test('share one source subscription and final teardown',[1,1,[8],[8]],()=>{let starts=0,ends=0,push;const source=new rx.Observable(s=>{starts++;push=x=>s.next(x);return()=>ends++;}).pipe(rx.share());const a=[],b=[];const x=source.subscribe(v=>a.push(v)),y=source.subscribe(v=>b.push(v));push(8);x.unsubscribe();y.unsubscribe();return[starts,ends,a,b];});
test('shareReplay caches completed last value',[1,[5],[5]],()=>{let n=0;const s=rx.defer(()=>{n++;return rx.of(5);}).pipe(rx.shareReplay({bufferSize:1,refCount:true})),a=[],b=[];s.subscribe(x=>a.push(x));s.subscribe(x=>b.push(x));return[n,a,b];});
test('catchError replacement',[1,9,10],()=>values(rx.concat(rx.of(1),rx.throwError(()=>new Error('source-error'))).pipe(rx.catchError(()=>rx.of(9,10)))));
test('retry attempts and final error',[3,[42],1,'final-error'],async()=>{let n=0,z=0,error='';const a=await values(rx.defer(()=>++n<3?rx.throwError(()=>new Error('retry')):rx.of(42)).pipe(rx.retry(2)));try{await values(rx.defer(()=>{z++;return rx.throwError(()=>new Error('final-error'));}).pipe(rx.retry(0)));}catch(e){error=e.message;}return[n,a,z,error];});
test('finalize completion error and unsubscribe',[1,1,1],async()=>{let a=0,b=0,c=0;await values(rx.of(1).pipe(rx.finalize(()=>a++)));try{await values(rx.throwError(()=>new Error('expected')).pipe(rx.finalize(()=>b++)));}catch(e){if(e.message!=='expected')throw e;}const sub=rx.NEVER.pipe(rx.finalize(()=>c++)).subscribe();sub.unsubscribe();return[a,b,c];});
test('unsubscribe stops real timer and calls teardown once',[true,1,true],async()=>{const a=[];let ends=0;const sub=new rx.Observable(s=>{const id=setInterval(()=>s.next(a.length),5);return()=>{clearInterval(id);ends++;};}).subscribe(x=>a.push(x));await sleep(30);sub.unsubscribe();sub.unsubscribe();const n=a.length;await sleep(25);return[n>0,ends,n===a.length];});
test('takeUntil completes and releases source',[true,1],async()=>{let ended=0,completed=false;await new Promise((resolve,reject)=>rx.interval(5).pipe(rx.finalize(()=>ended++),rx.takeUntil(rx.timer(25))).subscribe({error:reject,complete(){completed=true;resolve();}}));return[completed,ended];});
test('timer interval and take',[0,1,2],()=>values(rx.timer(5,5).pipe(rx.take(3))));
test('delay respects minimum elapsed time',[[7],true],async()=>{const start=Date.now(),a=await values(rx.of(7).pipe(rx.delay(30)));return[a,Date.now()-start>=25];});
test('debounceTime flushes pending value on completion',[3],()=>values(rx.of(1,2,3).pipe(rx.debounceTime(20))));
test('timeout reports TimeoutError','TimeoutError',async()=>{try{await values(rx.NEVER.pipe(rx.timeout(15)));return'no error';}catch(e){return e.name;}});
test('repeat resubscribes requested times',[1,2,1,2,1,2],()=>values(rx.of(1,2).pipe(rx.repeat(3))));
test('fromEventPattern unregisters handler',[[1,2],1],()=>{let handler,removed=0;const a=[],s=rx.fromEventPattern(h=>{handler=h;},h=>{if(h===handler)removed++;}).subscribe(x=>a.push(x));handler(1);handler(2);s.unsubscribe();handler(3);return[a,removed];});
test('fromEvent removes Node EventEmitter listener',[[5],0],()=>{const {EventEmitter}=require('events'),e=new EventEmitter(),a=[];const s=rx.fromEvent(e,'data').subscribe(x=>a.push(x));e.emit('data',5);s.unsubscribe();e.emit('data',6);return[a,e.listenerCount('data')];});
test('throwing map delivers error notification',[[2],'map-error'],async()=>{const a=[];let error='';await new Promise(resolve=>rx.of(1,2,3).pipe(rx.map(x=>{if(x===2)throw new Error('map-error');return x*2;})).subscribe({next:x=>a.push(x),error:e=>{error=e.message;resolve();},complete:resolve}));return[a,error];});
test('CommonJS operators subpath',[3,6],()=>{const {map}=require(config.packageName+'/operators');return values(rx.of(1,2).pipe(map(x=>x*3)));});
test('dynamic import public entry',[4,8],async()=>{const mod=await import(config.packageName);return values(mod.of(1,2).pipe(mod.map(x=>x*4)));});
test('UMD browser distribution executes in vm',[2,4],()=>{const vm=require('vm'),root=path.dirname(require.resolve(config.packageName+'/package.json')),sandbox={setTimeout,clearTimeout,setInterval,clearInterval};vm.runInNewContext(fs.readFileSync(path.join(root,'dist/bundles/rxjs.umd.js'),'utf8'),sandbox,{timeout:1000});const a=[];sandbox.rxjs.of(1,2).pipe(sandbox.rxjs.map(x=>x*2)).subscribe(x=>a.push(x));return a;});
test('TestScheduler virtual time and subscription lifecycle',true,()=>{const assert=require('assert'),{TestScheduler}=require(config.packageName+'/testing');new TestScheduler((a,b)=>assert.deepStrictEqual(a,b)).run(({cold,expectObservable,expectSubscriptions})=>{const s=cold('-a-b-c-|',{a:1,b:2,c:3});expectObservable(s.pipe(rx.map(x=>x*2))).toBe('-a-b-c-|',{a:2,b:4,c:6});expectSubscriptions(s.subscriptions).toBe('^------!');});return true;});
test('Worker stream computation exact package and clean exit',[[4,6],true,0],()=>new Promise((resolve,reject)=>{const {Worker}=require('worker_threads'),w=new Worker(path.join(__dirname,'worker.cjs'),{workerData:config});let result;const timer=setTimeout(()=>{w.terminate();reject(new Error('Worker exit timeout'));},3000);w.on('message',m=>{result=m;});w.on('error',e=>{clearTimeout(timer);reject(e);});w.on('exit',code=>{clearTimeout(timer);if(!result)return reject(new Error('Worker returned no result'));resolve([result.values,result.identity,code]);});}));
async function run(c,out){
 config=c;const startedAt=new Date().toISOString(),runId='rxjs-'+Date.now()+'-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');
 const results=[];let loadError;
 try{rx=require(config.packageName);}catch(e){loadError=e;}
 for(const item of cases){const start=Date.now();let actual=null,error=null;try{if(loadError)throw loadError;actual=await item.fn();require('assert').deepStrictEqual(actual,item.expected);}catch(e){error={name:e.name,message:e.message,stack:e.stack};}results.push({name:item.name,status:error?'failed':'passed',expected:item.expected,actual,durationMs:Date.now()-start,...(error?{error}:{})});}
 const fail=results.filter(x=>x.status==='failed').length;
 const report={...config,runId,pid:process.pid,startedAt,completedAt:new Date().toISOString(),versions:process.versions,platform:process.platform,arch:process.arch,expectedTotal:cases.length,total:results.length,pass:results.length-fail,fail,notRun:0,status:fail?'failed':'passed',results};
 fs.mkdirSync(out,{recursive:true});const raw=JSON.stringify(report,null,2)+'\n';fs.writeFileSync(path.join(out,runId+'.json'),raw);const temp=path.join(out,'latest-'+runId+'.tmp');fs.writeFileSync(temp,raw);fs.renameSync(temp,path.join(out,'latest.json'));console.log('RXJSPORT_RESULT '+JSON.stringify(report));return report;
}
module.exports={run,cases:cases.map(({name,expected})=>({name,expected,required:true}))};
