'use strict';
const {parentPort,workerData}=require('worker_threads'),fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const onig=require(workerData.packageName),release=path.dirname(require.resolve(workerData.packageName));
 const buffer=fs.readFileSync(path.join(release,'onig.wasm'));
 const data=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
 let customCalled=false;
 let input=data;
 if(workerData.mode==='options')input={data,print:()=>{}};
 let responseProvider=null;
 if(workerData.mode==='response'){
  // Electron's bundled undici initializes llhttp WASM even when constructing
  // Response. Supply a real WHATWG Response implementation only in this Worker
  // when WASM is unavailable; this is a declared demo dependency, not a mock.
  if(typeof WebAssembly!=='object')globalThis.Response=require('node-fetch').Response;
  responseProvider=typeof WebAssembly==='object'?'native':'node-fetch@2.7.0';
  input=new Response(buffer,{headers:{'Content-Type':'application/wasm'}});
 }
 if(workerData.mode==='instantiator')input={instantiator:async imports=>{
  customCalled=true;
  if(typeof WebAssembly==='object')return WebAssembly.instantiate(data,imports);
  return {instance:{exports:require(path.join(release,'onig.asm.cjs'))(imports.env,imports.wasi_snapshot_preview1)}};
 }};
 await onig.loadWASM(input);await onig.loadWASM(input);
 const scanner=onig.createOnigScanner(['(鸿蒙)([0-9]+)']);const str=onig.createOnigString('😀鸿蒙42');
 let result;
 try{result=scanner.findNextMatchSync(str,0);assert.deepStrictEqual(result,{index:0,captureIndices:[{start:2,end:6,length:4},{start:2,end:4,length:2},{start:4,end:6,length:2}]});}
 finally{str.dispose();scanner.dispose();}
 if(workerData.mode==='instantiator')assert(customCalled,'custom instantiator was not called');
 parentPort.postMessage({result,customCalled,responseProvider,backend:typeof WebAssembly==='object'?'wasm':'asm.js',exitReady:true});
})().catch(e=>{throw e;});
