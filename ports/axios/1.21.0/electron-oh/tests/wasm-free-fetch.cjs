'use strict';
const path=require('node:path');
module.exports=function install(packageRoot,force=false){
 if(!force&&typeof WebAssembly!=='undefined')return {fetch:'native'};
 // Load only the official web primitives; the package root initializes its Wasm HTTP parser.
 const modules=path.join(packageRoot,'node_modules/undici/lib/web/fetch');
 const {Response}=require(path.join(modules,'response.js'));
 const {Request}=require(path.join(modules,'request.js'));
 const {Headers}=require(path.join(modules,'headers.js'));
 const {FormData}=require(path.join(modules,'formdata.js'));
 const {dataURLProcessor,serializeAMimeType}=require(path.join(modules,'data-url.js'));
 const {Blob,File}=require('node:buffer');const web=require('node:stream/web');const {Readable}=require('node:stream');
 const transport=require(path.join(packageRoot,'node_modules/@whatwg-node/node-fetch'));
 const fetch=async(input,init)=>{
  const request=new Request(input,init);
  const controller=new AbortController();let bodyError;
  const abort=()=>controller.abort(request.signal.reason);
  if(request.signal.aborted)abort();else request.signal.addEventListener('abort',abort,{once:true});
  try{
   if(controller.signal.aborted)throw controller.signal.reason;
   if(request.url.startsWith('data:')){
    const data=dataURLProcessor(new URL(request.url));if(data==='failure')throw new TypeError('fetch failed');
    request.signal.removeEventListener('abort',abort);
    return new Response(data.body,{headers:{'content-type':serializeAMimeType(data.mimeType)}});
   }
   const outgoing=new transport.Request(request);outgoing._signal=controller.signal;
   const upload=outgoing.generateBody()?.readable;
   if(upload)upload.on('error',error=>{bodyError=error;controller.abort(error)});
   const raw=await transport.fetch(outgoing);
   const stream=raw.generateBody()?.readable;
   if(stream)stream.once('close',()=>request.signal.removeEventListener('abort',abort));
   else request.signal.removeEventListener('abort',abort);
   const response=new Response(request.method==='HEAD'||[204,205,304].includes(raw.status)?null:stream?Readable.toWeb(stream):null,
     {status:raw.status,statusText:raw.statusText,headers:[...raw.headers]});
   Object.defineProperties(response,{url:{value:raw.url,configurable:true},redirected:{value:raw.redirected,configurable:true}});
   return response;
  }catch(error){
   request.signal.removeEventListener('abort',abort);
   if(bodyError)throw bodyError;
   if(controller.signal.aborted)throw controller.signal.reason;
   if(typeof error?.code==='string'&&/^(?:EAI_|ECONN|EHOST|ENET|EPIPE|EPROTO|ETIMEDOUT|ENOTFOUND)/.test(error.code))throw new TypeError('fetch failed',{cause:error});
   throw error;
  }
 };
 for(const [name,value] of Object.entries({fetch,Request,Response,Headers,FormData,Blob,File,...web})){
  delete globalThis[name];Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
 }
 return {fetch:'node:http/https + undici@6.29.1 web primitives',wasm:typeof WebAssembly};
};
