'use strict';
const {workerData,parentPort}=require('node:worker_threads');
require('./wasm-free-fetch.cjs')(__dirname,true);
const axios=require(workerData.packageName);
axios.get(workerData.url+'/echo',{adapter:'http',proxy:false,timeout:4000}).then(r=>parentPort.postMessage({status:r.status,message:r.data.message})).catch(e=>{throw e;});
