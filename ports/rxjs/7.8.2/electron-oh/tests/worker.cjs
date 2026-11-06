'use strict';
const {parentPort,workerData:c}=require('worker_threads');
const rx=require(c.packageName),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.dirname(require.resolve(c.packageName+'/package.json'));
const meta=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
const identity=meta.name===c.packageName&&meta.version===c.packageVersion&&Object.entries(c.libraryFiles).every(([f,h])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')===h);
rx.lastValueFrom(rx.of(1,2,3).pipe(rx.map(x=>x*2),rx.filter(x=>x>2),rx.toArray())).then(values=>{parentPort.postMessage({values,identity,pid:process.pid,versions:process.versions});parentPort.close();}).catch(e=>{throw e;});
