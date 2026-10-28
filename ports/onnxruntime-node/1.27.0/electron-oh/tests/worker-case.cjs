 'use strict';
const {parentPort}=require('node:worker_threads');
const path=require('node:path');
const input=require('./input.json');
const ort=require(input.packageName);
(async()=>{
 const s=await ort.InferenceSession.create(path.join(__dirname,'fixtures/test_types_float.onnx'),{intraOpNumThreads:1});
 try{const out=await s.run({input:new ort.Tensor('float32',new Float32Array([1,2,3,4,5]),[1,5])});parentPort.postMessage({ok:true,values:Array.from(out.output.data)});}
 finally{await s.release();parentPort.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;parentPort.close();});
