'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const input = require('./input.json');
const entry = require.resolve(input.packageName);
const packageRoot = path.dirname(path.dirname(entry));
const storageFile = path.join(packageRoot, 'dist/storage.js');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function reset() {
  for (const file of ['index.js','devdeviceid.js','storage.js']) delete require.cache[path.join(packageRoot,'dist',file)];
}
function directory(home) {
  return path.join(process.platform === 'darwin' ? path.join(home,'Library/Application Support') : (process.env.XDG_CACHE_HOME || path.join(home,'.cache')), 'Microsoft/DeveloperTools');
}
async function homeScope(home, xdg, operation) {
  const oldHome = process.env.HOME, oldXdg = process.env.XDG_CACHE_HOME;
  process.env.HOME = home;
  if (xdg === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = xdg;
  fs.mkdirSync(home,{recursive:true});reset();
  try { return await operation(); }
  finally {
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    if (oldXdg === undefined) delete process.env.XDG_CACHE_HOME; else process.env.XDG_CACHE_HOME = oldXdg;
    reset();
  }
}
module.exports = async function({userData,runId,emit}) {
  fs.mkdirSync(userData,{recursive:true});
  const scratch = fs.mkdtempSync(path.join(userData,'deviceid-test-'));
  const results = [];
  const loadedFiles = {};
  let persistentId;
  const run = async (name, operation) => {
    try { await operation();results.push({name,status:'pass',detail:'assertions passed'}); }
    catch (error) {results.push({name,status:'fail',detail:String(error.stack||error)});}
    emit('case',results[results.length-1]);
  };
  const isolated = (name,fn) => homeScope(path.join(scratch,name),undefined,fn);
  const get = () => require(entry).getDeviceId();
  const stored = () => path.join(directory(process.env.HOME),'deviceid');
  const seed = value => {fs.mkdirSync(path.dirname(stored()),{recursive:true});fs.writeFileSync(stored(),value,'utf8');};
  try {
    await run('exact package identity and unmodified installed bytes', async()=>{
      const meta = require(path.join(packageRoot,'package.json'));
      assert.equal(meta.name,input.packageName);assert.equal(meta.version,input.packageVersion);
      for(const [file,expected] of Object.entries(input.packageFiles)) {
        loadedFiles[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(packageRoot,file))).digest('hex');
        assert.equal(loadedFiles[file],expected,file);
      }
      if(input.host==='node') {assert.equal(process.versions.node,'24.13.0');assert.equal(process.versions.electron,undefined);}
      if(input.host==='electron') {
        if(input.expectedRuntime) {
          assert.equal(process.versions.electron,input.expectedRuntime.electron);
          assert.equal(process.versions.node.split('.')[0],String(input.expectedRuntime.nodeMajor));
          assert.equal(process.versions.chrome.split('.')[0],String(input.expectedRuntime.chromeMajor));
        } else {assert.equal(process.versions.electron,'37.2.0');assert.equal(process.versions.node,'22.17.0');}
      }
      if(input.host!=='host') {assert.ok(['ohos','openharmony'].includes(process.platform));assert.equal(process.arch,'arm64');}
    });
    await run('return existing stored ID',()=>isolated('existing',async()=>{seed('known-existing-id');assert.equal(await get(),'known-existing-id');}));
    await run('generate lowercase UUID v4 and persist file',()=>isolated('new',async()=>{const id=await get();assert.match(id,uuid);assert.equal(fs.readFileSync(stored(),'utf8'),id);assert.equal(await get(),id);}));
    await run('strip UTF-8 BOM and rewrite file',()=>isolated('bom',async()=>{seed('\uFEFFbom-free-id');assert.equal(await get(),'bom-free-id');assert.equal(fs.readFileSync(stored(),'utf8'),'bom-free-id');}));
    await run('regenerate empty stored ID',()=>isolated('empty',async()=>{seed('');const id=await get();assert.match(id,uuid);assert.equal(fs.readFileSync(stored(),'utf8'),id);}));
    await run('honor XDG_CACHE_HOME',()=>homeScope(path.join(scratch,'xdg-home'),path.join(scratch,'xdg-cache'),async()=>{const id=await get();assert.match(id,uuid);assert.equal(fs.readFileSync(stored(),'utf8'),id);assert.ok(!fs.existsSync(path.join(process.env.HOME,'.cache/Microsoft/DeveloperTools/deviceid')));}));
    await run('HOME cache fallback without XDG_CACHE_HOME',()=>isolated('home',async()=>{const id=await get();assert.equal(fs.readFileSync(stored(),'utf8'),id);assert.ok(stored().startsWith(process.env.HOME));}));
    await run('recover simulated read exception using real storage write',()=>isolated('read-error',async()=>{
      const storage=require(storageFile);const original=storage.getDeviceId;
      storage.getDeviceId=async()=>{throw Error('deliberately simulated read failure');};
      try {const id=await get();assert.match(id,uuid);assert.equal(fs.readFileSync(stored(),'utf8'),id);}
      finally {storage.getDeviceId=original;}
    }));
    await run('platform aliases and unsupported-platform rejection (simulation)',async()=>{
      const original=Object.getOwnPropertyDescriptor(process,'platform');
      const supported=['linux','freebsd','darwin',...(input.harmonyPlatforms || ['ohos','openharmony'])];
      try {
        for(const platform of ['ohos','openharmony','linux','freebsd','darwin']) {
          Object.defineProperty(process,'platform',{value:platform,configurable:true});
          if(!supported.includes(platform)) {reset();assert.throws(()=>require(entry),/Unsupported platform/);continue;}
          await isolated('alias-'+platform,async()=>{const id=await get();assert.match(id,uuid);assert.equal(fs.readFileSync(stored(),'utf8'),id);});
        }
        Object.defineProperty(process,'platform',{value:'unsupported-test',configurable:true});reset();
        assert.throws(()=>require(entry),/Unsupported platform/);
      } finally {Object.defineProperty(process,'platform',original);reset();}
    });
    await run('persist across application cold starts',()=>homeScope(path.join(userData,'persistent-home'),undefined,async()=>{
      persistentId=await get();assert.match(persistentId,uuid);assert.equal(fs.readFileSync(stored(),'utf8'),persistentId);
      const proof=path.join(userData,'previous-id');
      if(fs.existsSync(proof)) assert.equal(fs.readFileSync(proof,'utf8'),persistentId);
      fs.writeFileSync(proof,persistentId);
    }));
  } finally {fs.rmSync(scratch,{recursive:true,force:true});}
  return {runId,pid:process.pid,host:input.host,packageName:input.packageName,packageVersion:input.packageVersion,
    packageSha256:input.packageSha256,packageFiles:loadedFiles,persistentId,versions:process.versions,
    platform:process.platform,arch:process.arch,total:results.length,pass:results.filter(x=>x.status==='pass').length,
    fail:results.filter(x=>x.status==='fail').length,pending:0,results};
};
