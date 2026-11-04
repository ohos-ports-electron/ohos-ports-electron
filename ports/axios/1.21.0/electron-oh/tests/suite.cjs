'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),http=require('node:http'),https=require('node:https');
const zlib=require('node:zlib'),{Readable}=require('node:stream');
const definitions=[
 ['installed package bytes match frozen tgz',true,async c=>Object.entries(c.config.libraryFiles).every(([f,h])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(c.pkg,f))).digest('hex')===h)],
 ['CJS public version and callable API',['1.21.0','function','function'],async c=>[c.axios.VERSION,typeof c.axios,typeof c.axios.create]],
 ['ESM default and named exports',['1.21.0','function'],async c=>{const m=await import(require('node:url').pathToFileURL(path.join(c.pkg,'index.js')).href);return [m.default.VERSION,typeof m.AxiosError];}],
 ['HTTP GET JSON and params',[200,'鸿蒙','a b'],async c=>{const r=await c.client.get('/echo',{params:{q:'a b'}});return [r.status,r.data.message,r.data.query.q];}],
 ['HTTP POST JSON body',['POST',{answer:42}],async c=>{const r=await c.client.post('/echo',{answer:42});return [r.data.method,JSON.parse(r.data.body)];}],
 ['PUT PATCH DELETE methods',['PUT','PATCH','DELETE'],async c=>{const values=[];for(const method of ['put','patch','delete'])values.push((await c.client.request({url:'/echo',method})).data.method);return values;}],
 ['HEAD and OPTIONS requests',[200,'OPTIONS'],async c=>[(await c.client.head('/echo')).status,(await c.client.options('/echo')).data.method]],
 ['instance defaults and per-request headers',['default','request'],async c=>{const a=c.axios.create({baseURL:c.url,adapter:'http',proxy:false,headers:{'X-Default':'default'}});const r=await a.get('/echo',{headers:{'X-Request':'request'}});return [r.data.headers['x-default'],r.data.headers['x-request']];}],
 ['request and response interceptors',['intercepted',true],async c=>{const a=c.axios.create({baseURL:c.url,adapter:'http',proxy:false});a.interceptors.request.use(x=>{x.headers.set('X-Test','intercepted');return x;});a.interceptors.response.use(x=>{x.data.modified=true;return x;});const r=await a.get('/echo');return [r.data.headers['x-test'],r.data.modified];}],
 ['interceptor eject and clear',false,async c=>{const a=c.axios.create({baseURL:c.url,adapter:'http',proxy:false});const id=a.interceptors.request.use(x=>{x.headers.set('X-Removed','bad');return x;});a.interceptors.request.eject(id);a.interceptors.response.use(x=>x);a.interceptors.response.clear();return 'x-removed' in (await a.get('/echo')).data.headers;}],
 ['redirect follows and reports final URL',[200,true],async c=>{const r=await c.client.get('/redirect');return [r.status,r.request.res.responseUrl.endsWith('/echo?redirected=yes')];}],
 ['redirect limit rejects',['ERR_FR_TOO_MANY_REDIRECTS',true],async c=>{try{await c.client.get('/loop',{maxRedirects:1});throw Error('expected redirect error');}catch(e){return [e.code,c.axios.isAxiosError(e)];}}],
 ['gzip response decompression','compressed 鸿蒙',async c=>(await c.client.get('/gzip')).data],
 ['binary arraybuffer preserves bytes',[0,1,127,255],async c=>Array.from((await c.client.get('/binary',{responseType:'arraybuffer'})).data)],
 ['response stream consumes and closes','stream-鸿蒙',async c=>{const r=await c.client.get('/stream',{responseType:'stream'});const chunks=[];for await(const chunk of r.data)chunks.push(chunk);return Buffer.concat(chunks).toString();}],
 ['stream upload reaches HTTP server','upload-stream',async c=>(await c.client.post('/echo',Readable.from(['upload-','stream']),{headers:{'Content-Type':'text/plain'}})).data.body],
 ['URLSearchParams request encoding','name=a+b&n=2',async c=>(await c.client.post('/echo',new URLSearchParams({name:'a b',n:'2'}))).data.body],
 ['multipart form-data reaches server',[true,true],async c=>{const FormData=require('form-data');const form=new FormData();form.append('name','鸿蒙');form.append('file',Buffer.from('file-contents'),{filename:'example.txt'});const r=await c.client.post('/echo',form,{headers:form.getHeaders()});return [r.data.headers['content-type'].startsWith('multipart/form-data; boundary='),r.data.body.includes('file-contents')&&r.data.body.includes('鸿蒙')];}],
 ['basic authentication encoded','Basic '+Buffer.from('user:secret').toString('base64'),async c=>(await c.client.get('/echo',{auth:{username:'user',password:'secret'}})).data.headers.authorization],
 ['HTTP status error and serialization',[true,418,'ERR_BAD_REQUEST',418],async c=>{try{await c.client.get('/status/418');throw Error('expected status rejection');}catch(e){return [c.axios.isAxiosError(e),e.response.status,e.code,e.toJSON().status];}}],
 ['validateStatus accepts custom status',418,async c=>(await c.client.get('/status/418',{validateStatus:s=>s===418})).status],
 ['timeout rejects with ECONNABORTED','ECONNABORTED',async c=>{try{await c.client.get('/slow',{timeout:35});throw Error('expected timeout');}catch(e){return e.code;}}],
 ['AbortController cancels active HTTP',['ERR_CANCELED',true],async c=>{const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),35);try{await c.client.get('/slow',{signal:ac.signal});throw Error('expected cancellation');}catch(e){return [e.code,c.axios.isCancel(e)];}finally{clearTimeout(timer);}}],
 ['CancelToken pre-cancel prevents request',['ERR_CANCELED','stop'],async c=>{const source=c.axios.CancelToken.source();source.cancel('stop');try{await c.client.get('/echo',{cancelToken:source.token});throw Error('expected cancellation');}catch(e){return [e.code,e.message];}}],
 ['maxContentLength rejects oversize response','ERR_BAD_RESPONSE',async c=>{try{await c.client.get('/binary',{maxContentLength:2});throw Error('expected size error');}catch(e){return e.code;}}],
 ['transformRequest and transformResponse',['CUSTOM',true],async c=>{const r=await c.client.post('/echo','custom',{transformRequest:[x=>x.toUpperCase()],transformResponse:[x=>({...JSON.parse(x),transformed:true})]});return [r.data.body,r.data.transformed];}],
 ['getUri and mergeConfig preserve overrides',[true,2,'a'],async c=>{const uri=c.client.getUri({url:'/echo',params:{q:'value'}});const merged=c.axios.mergeConfig({timeout:1,headers:{common:{'X-One':'a'}}},{timeout:2});return [uri===c.url+'/echo?q=value',merged.timeout,merged.headers.common['X-One']];}],
 ['AxiosHeaders case insensitive access and normalization',['v','application/json'],async c=>{const h=new c.axios.AxiosHeaders({'X-Test':'v','content-type':'application/json'});h.normalize();return [h.get('x-test'),h.getContentType()];}],
 ['all and spread combine concurrent real requests',[200,200],async c=>c.axios.all([c.client.get('/echo'),c.client.get('/echo')]).then(c.axios.spread((a,b)=>[a.status,b.status]))],
 ['HTTPS request with explicit local CA',[200,'鸿蒙'],async c=>{const r=await c.axios.get(c.secureUrl+'/echo',{adapter:'http',proxy:false,httpsAgent:c.tlsAgent});return [r.status,r.data.message];}],
 ['HTTPS rejects an untrusted certificate',true,async c=>{try{await c.axios.get(c.secureUrl+'/echo',{adapter:'http',proxy:false});return false;}catch(e){return c.axios.isAxiosError(e)&&/CERT|SELF_SIGNED|VERIFY/.test(e.code||'');}}],
 ['Fetch adapter with explicit WASM-free transport',[200,'鸿蒙'],async c=>{const r=await c.axios.get(c.url+'/echo',{adapter:'fetch',env:{fetch:globalThis.fetch,Request:globalThis.Request,Response:globalThis.Response}});return [r.status,r.data.message];}],
 ['Fetch arraybuffer and cancellation',[[0,1,127,255],'ERR_CANCELED'],async c=>{const env={fetch:globalThis.fetch,Request:globalThis.Request,Response:globalThis.Response};const r=await c.axios.get(c.url+'/binary',{adapter:'fetch',env,responseType:'arraybuffer'});const ac=new AbortController();ac.abort();let code;try{await c.axios.get(c.url+'/slow',{adapter:'fetch',env,signal:ac.signal});}catch(e){code=e.code;}return [Array.from(new Uint8Array(r.data)),code];}],
 ['Worker performs HTTP and exits cleanly',[0,200,'鸿蒙'],async c=>{const {Worker}=require('node:worker_threads');let message;const code=await new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{packageName:c.config.packageName,url:c.url}});w.on('message',m=>message=m);w.on('error',reject);w.on('exit',resolve);});return [code,message.status,message.message];}],
 ['keep-alive agent and response resources released',true,async c=>{const agent=new http.Agent({keepAlive:true});await c.client.get('/echo',{httpAgent:agent});agent.destroy();await new Promise(resolve=>setTimeout(resolve,30));return Object.values(agent.sockets).flat().length===0;}],
];
async function run(config,outputDir){
 const startedAt=new Date().toISOString(),runId=crypto.randomBytes(12).toString('hex');const results=[];
 let axios,pkg,server,tlsServer,loadError,client,url,secureUrl,tlsAgent;
 const sockets=new Set();
 const handler=(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname==='/redirect'){res.writeHead(302,{Location:'/echo?redirected=yes'});res.end();return;}
  if(u.pathname==='/loop'){res.writeHead(302,{Location:'/loop'});res.end();return;}
  if(u.pathname==='/gzip'){res.writeHead(200,{'Content-Encoding':'gzip','Content-Type':'text/plain'});res.end(zlib.gzipSync('compressed 鸿蒙'));return;}
  if(u.pathname==='/binary'){res.end(Buffer.from([0,1,127,255]));return;}
  if(u.pathname==='/stream'){res.write('stream-');res.end('鸿蒙');return;}
  if(u.pathname==='/slow'){const timer=setTimeout(()=>res.end('slow'),220);res.once('close',()=>clearTimeout(timer));return;}
  if(u.pathname==='/status/418'){res.writeHead(418,{'Content-Type':'application/json'});res.end('{"teapot":true}');return;}
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:'鸿蒙',method:req.method,headers:req.headers,query:Object.fromEntries(u.searchParams),body:Buffer.concat(chunks).toString()}));});
 };
 const listen=s=>new Promise((resolve,reject)=>{s.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
 try{
  require('./wasm-free-fetch.cjs')(__dirname,true);
  axios=require(config.packageName);pkg=path.resolve(path.dirname(require.resolve(config.packageName)),'../..');
  server=http.createServer(handler);await listen(server);url='http://127.0.0.1:'+server.address().port;
  const ca=fs.readFileSync(path.join(__dirname,'fixtures/localhost.crt'));tlsAgent=new https.Agent({ca});
  tlsServer=https.createServer({key:fs.readFileSync(path.join(__dirname,'fixtures/localhost.key')),cert:ca},handler);await listen(tlsServer);secureUrl='https://127.0.0.1:'+tlsServer.address().port;
  client=axios.create({baseURL:url,adapter:'http',proxy:false,timeout:4000});
 }catch(e){loadError=e;}
 for(const [name,expected,body] of definitions){const start=Date.now();let actual=null,status='passed',error=null;
  try{if(loadError)throw loadError;actual=await body({axios,pkg,client,url,secureUrl,tlsAgent,config});assert.deepStrictEqual(actual,expected);}catch(e){status='failed';error={name:e.name,code:e.code,message:e.message,stack:e.stack};}
  const result={name,status,expected,actual,durationMs:Date.now()-start,error};results.push(result);console.log('AXIOSPORT_CASE '+JSON.stringify({runId,pid:process.pid,...result}));
 }
 let cleanupError=null;try{if(tlsAgent)tlsAgent.destroy();for(const socket of sockets)socket.destroy();for(const s of [server,tlsServer])if(s&&s.listening)await new Promise(resolve=>s.close(resolve));}catch(e){cleanupError=String(e);}
 const report={runId,pid:process.pid,startedAt,finishedAt:new Date().toISOString(),packageSha256:config.packageSha256,packageName:config.packageName,packageVersion:config.packageVersion,phase:config.phase,targetId:config.targetId,versions:process.versions,platform:process.platform,arch:process.arch,expectedTotal:definitions.length,total:results.length,pass:results.filter(x=>x.status==='passed').length,fail:results.filter(x=>x.status==='failed').length,notRun:0,results,cleanupError,transportMode:'Node http/https; fetch tests explicitly use reference WASM-free bridge'};
 report.status=report.fail===0&&!cleanupError?'passed':'failed';fs.mkdirSync(outputDir,{recursive:true});const json=JSON.stringify(report,null,2);for(const name of [runId+'.json','latest.json']){fs.writeFileSync(path.join(outputDir,name+'.tmp'),json);fs.renameSync(path.join(outputDir,name+'.tmp'),path.join(outputDir,name));}console.log('AXIOSPORT_DONE '+JSON.stringify({runId,pid:process.pid,status:report.status,pass:report.pass,total:report.total}));return report;
}
module.exports={run,definitions};
