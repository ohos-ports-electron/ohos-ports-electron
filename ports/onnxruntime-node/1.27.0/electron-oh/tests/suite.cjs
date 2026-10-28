'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
module.exports = async function run({emit, runId}) {
  const input = require('./input.json');
  const pkgRoot = path.dirname(require.resolve(input.packageName+'/package.json'));
  const base = {runId,pid:process.pid,packageName:input.packageName,packageVersion:input.packageVersion,
    packageSha256:input.packageSha256,versions:process.versions,platform:process.platform,arch:process.arch};
  const results=[];
  const test=async(name,fn)=>{try {await fn();results.push({name,status:'passed'});}catch(e){results.push({name,status:'failed',error:String(e.stack||e)});}emit('case',{...base,...results[results.length-1]});};
  let ort;
  await test('installed-package-byte-integrity',()=>{
    for(const [name,expected] of Object.entries(input.packageFiles)) {
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(pkgRoot,name))).digest('hex'),expected,name);
    }
    assert.equal(require(input.packageName+'/package.json').version,input.packageVersion);
  });
  await test('native-addon-load',()=>{ort=require(input.packageName);assert.equal(typeof ort.InferenceSession.create,'function');
    const native=Object.keys(require.cache).filter(p=>p.endsWith('/onnxruntime_binding.node')||p.endsWith('/onnxruntime_binding_electron.node'));
    const electronOH=(process.platform==='ohos'||process.platform==='openharmony')&&!!process.versions.electron;
    const relative=electronOH?'bin/electron-oh/napi-v6/'+process.arch+'/onnxruntime_binding_electron.node':'bin/napi-v6/'+(process.platform==='ohos'?'openharmony':process.platform)+'/'+process.arch+'/onnxruntime_binding.node';
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(native[0])).digest('hex'),input.packageFiles[relative]);
    assert.equal(native.length,1);emit('native',{...base,path:native[0],sha256:crypto.createHash('sha256').update(fs.readFileSync(native[0])).digest('hex')});});
  if(!ort) return finish();
  const fixture=name=>path.join(__dirname,'fixtures',name);
  const session=async(name,options)=>ort.InferenceSession.create(fixture(name),options);
  const identity=async(name,type,data)=>{const s=await session(name,{executionProviders:['cpu'],intraOpNumThreads:1});try{
    assert.equal(s.inputNames.length,1);assert.equal(s.outputNames.length,1);
    const result=await s.run({[s.inputNames[0]]:new ort.Tensor(type,data,[1,5])});
    assert.equal(result[s.outputNames[0]].type,type);assert.deepEqual(Array.from(result[s.outputNames[0]].data),Array.from(data));
  }finally{await s.release();}};
  await test('float32-identity-path',()=>identity('test_types_float.onnx','float32',new Float32Array([1,-2,0,3.5,100])));
  await test('int64-identity-path',()=>identity('test_types_int64.onnx','int64',new BigInt64Array([1n,-2n,0n,3n,9223372036854775807n])));
  await test('string-identity-path',()=>identity('test_types_string.onnx','string',['hello','鸿蒙','','ONNX','世界']));
  await test('model-buffer-and-metadata',async()=>{const s=await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(fixture('test_types_float.onnx'))));try{assert.deepEqual(s.inputNames,['input']);assert.deepEqual(s.outputNames,['output']);}finally{await s.release();}});
  await test('squeezenet-reference-output',async()=>{
    const s=await session('squeezenet.onnx',{executionProviders:['cpu'],intraOpNumThreads:1});try{
      const source=JSON.parse(fs.readFileSync(fixture('squeezenet.input0.json'),'utf8'));
      const expected=JSON.parse(fs.readFileSync(fixture('squeezenet.output0.json'),'utf8'));
      const values=Array.isArray(source)?source:source.data;
      const ref=Array.isArray(expected)?expected:expected.data;
      const out=await s.run({[s.inputNames[0]]:new ort.Tensor('float32',new Float32Array(values),[1,3,224,224])});
      const actual=out[s.outputNames[0]].data;assert.equal(actual.length,ref.length);let maxError=0;
      for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-ref[i]);assert.ok(Number.isFinite(actual[i]));assert.ok(error<=1e-3+1e-3*Math.abs(ref[i]),'output '+i);maxError=Math.max(maxError,error);}
      emit('numeric',{...base,elements:actual.length,maxAbsError:maxError});
    }finally{await s.release();}
  });
  await test('run-fetches-and-repeat',async()=>{const s=await session('test_types_float.onnx');try{
    const x=new ort.Tensor('float32',new Float32Array([1,2,3,4,5]),[1,5]);for(let i=0;i<3;i++){
      const out=await s.run({[s.inputNames[0]]:x},s.outputNames);assert.deepEqual(Array.from(out[s.outputNames[0]].data),[1,2,3,4,5]);}
  }finally{await s.release();}});
  await test('invalid-model-rejected',()=>assert.rejects(()=>ort.InferenceSession.create(new Uint8Array([1,2,3]))));
  await test('missing-model-rejected',()=>assert.rejects(()=>ort.InferenceSession.create(fixture('does-not-exist.onnx'))));
  await test('missing-feeds-rejected',async()=>{const s=await session('test_types_float.onnx');try{await assert.rejects(()=>s.run({}));}finally{await s.release();}});
  await test('wrong-dtype-rejected',async()=>{const s=await session('test_types_float.onnx');try{await assert.rejects(()=>s.run({[s.inputNames[0]]:new ort.Tensor('int32',new Int32Array(5),[1,5])}));}finally{await s.release();}});
  await test('wrong-dimensions-rejected',async()=>{const s=await session('test_types_float.onnx');try{await assert.rejects(()=>s.run({[s.inputNames[0]]:new ort.Tensor('float32',new Float32Array(3),[1,3])}));}finally{await s.release();}});
  await test('invalid-tensor-length-rejected',()=>assert.throws(()=>new ort.Tensor('float32',new Float32Array(3),[1,5])));
  await test('invalid-create-argument-rejected',()=>assert.rejects(()=>ort.InferenceSession.create()));
  await test('profiling-options-and-release',async()=>{const prefix=path.join(process.env.TMPDIR||process.cwd(),'ort-'+runId);const s=await session('test_types_float.onnx',{enableProfiling:true,profileFilePrefix:prefix,intraOpNumThreads:1});try{
    const x=new ort.Tensor('float32',new Float32Array(5),[1,5]);await s.run({[s.inputNames[0]]:x});await s.endProfiling();
  }finally{await s.release();}});
  await test('released-session-rejected',async()=>{const s=await session('test_types_float.onnx');await s.release();await assert.rejects(()=>s.run({input:new ort.Tensor('float32',new Float32Array(5),[1,5])}));});
  await test('repeated-session-create-run-release',async()=>{
    for(let i=0;i<10;i++) await identity('test_types_float.onnx','float32',new Float32Array([i,-i,0,3.5,100]));
  });
  await test('native-error-recovery',async()=>{
    for(let i=0;i<5;i++) await assert.rejects(()=>ort.InferenceSession.create(new Uint8Array([1,2,3])));
    await identity('test_types_float.onnx','float32',new Float32Array([1,2,3,4,5]));
  });
  await test('worker-inference-and-environment-cleanup',async()=>{
    const {Worker}=require('node:worker_threads');
    for(let i=0;i<2;i++) await new Promise((resolve,reject)=>{
      const worker=new Worker(path.join(__dirname,'worker-case.cjs'));
      const timer=setTimeout(()=>{worker.terminate();reject(Error('worker timeout'));},30000);
      let message;
      worker.on('message',value=>{message=value;});
      worker.on('error',error=>{clearTimeout(timer);reject(error);});
      worker.on('exit',code=>{clearTimeout(timer);try{assert.equal(code,0);assert.deepEqual(message,{ok:true,values:[1,2,3,4,5]});resolve();}catch(e){reject(e);}});
    });
  });
  return finish();
  function finish(){return {...base,total:results.length,pass:results.filter(r=>r.status==='passed').length,
    fail:results.filter(r=>r.status==='failed').length,results,expectedTotal:20,
    scope:'real native inference and tensor/error API; no platform simulation; no application persistence semantics'};}
};
