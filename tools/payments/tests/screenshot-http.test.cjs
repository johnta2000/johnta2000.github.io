const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');
const path = require('node:path');
let api;
before(async () => {
  const result = await esbuild.build({entryPoints:[path.join(__dirname,'../../../convex/paymentFileHttp.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'stubs',setup(b){
    b.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'server',namespace:'stub'}));
    b.onResolve({filter:/\.\/cardPayments$/},()=>({path:'auth',namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='server'?'export const httpAction = x => x;':'export async function authorized(ctx) { if (!ctx.allowed) throw Error("This account is not authorized"); return {workspaceOwner:"owner"}; }'}));
  }}]});
  const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,Request,Response,URL,Uint8Array,TextEncoder,TextDecoder});api=module.exports;
});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=','base64');
function setup(){ const log=[];return {log,ctx:{allowed:true,runQuery:async(_fn,args)=>{log.push(['query',args]);return {storageId:'stored',type:'image/png'};},runMutation:async(_fn,args)=>log.push(['attach',args]),storage:{get:async()=>new Blob([png],{type:'image/png'}),store:async()=>{log.push(['store']);return 'stored';},delete:async id=>log.push(['delete',id])}}};}
function post(type='image/png',body=png){return new Request('https://example.com/payment-file?id=account&month=2026-10',{method:'POST',headers:{Origin:'https://www.john-ta.com','Content-Type':type,'X-File-Name':'receipt.png','X-Request-Key':'retry-key'},body});}
test('authenticated uploads and downloads use Request.url correctly, preserve month, and disable caching',async()=>{
 const {ctx,log}=setup();let response=await api.attachment(ctx,post());assert.equal(response.status,200);
 assert.equal(log[0][1].accountId,'account');assert.equal(log[0][1].month,'2026-10');assert.equal(log[2][1].requestKey,'retry-key');
 response=await api.attachment(ctx,new Request('https://example.com/payment-file?id=file'));
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
});
test('unauthorized access, invalid files, missing destinations, and failed writes cannot publish or orphan files',async()=>{
 let {ctx,log}=setup();ctx.allowed=false;assert.equal((await api.attachment(ctx,post())).status,403);assert.equal(log.length,0);
 ({ctx,log}=setup());assert.equal((await api.attachment(ctx,post('image/svg+xml','<svg/>'))).status,400);assert.ok(!log.some(x=>x[0]==='store'));
 assert.equal((await api.attachment(ctx,post('image/png','not a png'))).status,400);
 assert.equal((await api.attachment(ctx,new Request('https://example.com/payment-file'))).status,400);
 ctx.runMutation=async()=>{throw Error('failure');};assert.equal((await api.attachment(ctx,post())).status,400);assert.ok(log.some(x=>x[0]==='delete'));
});
