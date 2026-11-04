'use strict';
const {workerData,parentPort}=require('node:worker_threads');
(async()=>{const Conf=(await import(workerData.packageName)).default;const s=new Conf({cwd:workerData.cwd});s.set('message','worker 鸿蒙');s._closeWatcher();const r=new Conf({cwd:workerData.cwd});parentPort.postMessage({value:r.get('message')});r._closeWatcher();})().catch(e=>{console.error(e);process.exitCode=1;});
