'use strict';
const {parentPort,workerData}=require('worker_threads'),fs=require('fs'),path=require('path');
(async()=>{const tar=require(workerData.packageName),dir=workerData.directory;fs.mkdirSync(path.join(dir,'out'),{recursive:true});fs.writeFileSync(path.join(dir,'a'),'worker 鸿蒙');await tar.c({cwd:dir,file:path.join(dir,'a.tar')},['a']);await tar.x({cwd:path.join(dir,'out'),file:path.join(dir,'a.tar')});parentPort.postMessage({content:fs.readFileSync(path.join(dir,'out/a'),'utf8'),exitReady:true});})().catch(e=>{throw e;});
