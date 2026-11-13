const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, mkdtempSync, rmSync} = require('node:fs');
const {pbkdf2Sync, randomBytes, createCipheriv} = require('node:crypto');
const {gzipSync,gunzipSync} = require('fflate');
const {getFunctionName} = require('convex/server');
const root = require('node:path').resolve(__dirname, '../..');
const key = pbkdf2Sync('test-only', 'test-salt', 250000, 32, 'sha256'), iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const guide = {main:'<main><h1>Example address</h1></main>',style:'body { margin:20px; }',wifi:{network:'test-network',password:'test-password'}};
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(guide)),cipher.final()]);
const payload = Object.fromEntries(Object.entries({salt:Buffer.from('test-salt'),iv,ciphertext,tag:cipher.getAuthTag()}).map(([k,v])=>[k,v.toString('base64')]));
const token = 'a'.repeat(43);

test('prepared private content avoids upstream fetches and still enforces expiry for new and existing links',async()=>{
 const dir=mkdtempSync('/tmp/apartment-sharing-test-');
 require('esbuild').buildSync({entryPoints:[root+'/convex/apartmentShareHttp.ts',root+'/convex/apartmentSharing.ts'],bundle:true,platform:'node',format:'cjs',outdir:dir});
 const {endpoint}=require(dir+'/apartmentShareHttp.js'),functions=require(dir+'/apartmentSharing.js');
 const originalFetch=global.fetch,records={apartmentShareLinks:[],apartmentShareGuides:[]},blobs=new Map();
 let downloads=0,readBlobs=0,expireDuringRead=false;const realNow=Date.now;
 const db={
  insert:async(table,record)=>{records[table].push({...record,_id:'row'+records[table].length});},
  query:table=>({withIndex:(_name,filter)=>{
   const conditions=[],q={eq:(field,value)=>{conditions.push([field,value]);return q;}};filter(q);
   return {unique:async()=>records[table].find(row=>conditions.every(([field,value])=>row[field]===value))||null};
  }})
 };
 const storage={store:async blob=>{const id='file'+blobs.size;blobs.set(id,blob);return id;},delete:async id=>blobs.delete(id),get:async id=>{readBlobs++;if(expireDuringRead)Date.now=()=>records.apartmentShareLinks[0].expiresAt+1;return blobs.get(id);}};
 const ctx={storage,runQuery:(fn,args)=>functions[getFunctionName(fn).split(':')[1]]._handler({db,storage},args),runMutation:(fn,args)=>functions[getFunctionName(fn).split(':')[1]]._handler({db,storage},args)};
 const request=(method,body,shareToken,v2=false)=>new Request('https://example.test/apartment-share'+(v2?'?v=2':''),{method,headers:{'Content-Type':'application/json',...(shareToken?{'X-Apartment-Share-Token':shareToken}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try {
  global.fetch=async()=>{downloads++;return new Response(JSON.stringify(payload));};
  assert.equal((await endpoint._handler(ctx,request('POST',{key:randomBytes(32).toString('base64')}))).status,404);
  assert.equal(records.apartmentShareLinks.length,0);
  const before=Date.now(),created=await endpoint._handler(ctx,request('POST',{key:key.toString('base64')}));
  assert.equal(created.status,200);const link=await created.json();
  assert.match(link.token,/^[A-Za-z0-9_-]{43}$/);assert.ok(link.expiresAt>=before+86400000);
  assert.equal(blobs.size,1);assert.notEqual(records.apartmentShareLinks[0].tokenHash,link.token);
  const fetches=downloads;
  assert.equal((await endpoint._handler(ctx,request('POST',{key:key.toString('base64')}))).status,200);
  assert.equal(downloads,fetches,'a ready guide makes creation independent of GitHub');
  assert.equal(blobs.size,1,'all links reuse the private prepared guide');
  const opened=await endpoint._handler(ctx,request('GET',null,link.token,true));
  assert.equal(opened.status,200);assert.equal(opened.headers.get('content-encoding'),'gzip');assert.equal(Number(opened.headers.get('X-Apartment-Share-Expires')),link.expiresAt);
  const content=JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(await opened.arrayBuffer()))));
  assert.deepEqual(content,{guide});assert.equal(content.key,undefined);
  const oldGuide={...guide};delete oldGuide.wifi;
  blobs.set('stale-file',new Blob([gzipSync(new TextEncoder().encode(JSON.stringify({guide:oldGuide})))]));
  records.apartmentShareLinks[0].guideStorageId='stale-file';
  for(const v2 of [false,true]) {
    const refreshed=await endpoint._handler(ctx,request('GET',null,link.token,v2));
    assert.equal(refreshed.status,200);
    const body=v2?JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(await refreshed.arrayBuffer())))):await refreshed.json();
    assert.deepEqual(body.guide.wifi,guide.wifi,'already-sent links must include current Wi-Fi');
    assert.equal(v2?Number(refreshed.headers.get('X-Apartment-Share-Expires')):body.expiresAt,link.expiresAt,'refreshing content never extends access');
  }
  assert.equal(downloads,fetches,'existing links use the current cached version');
  delete records.apartmentShareLinks[0].guideStorageId;
  const legacy=await endpoint._handler(ctx,request('GET',null,link.token));assert.equal(legacy.status,200);assert.deepEqual((await legacy.json()).guide,guide);
  assert.equal(downloads,fetches,'existing links also reuse the prepared content');
  expireDuringRead=true;
  assert.equal((await endpoint._handler(ctx,request('GET',null,link.token,true))).status,404,'recheck expiry after storage read');
  expireDuringRead=false;Date.now=realNow;records.apartmentShareLinks[0].expiresAt=Date.now()-1;const reads=readBlobs;
  assert.equal((await endpoint._handler(ctx,request('GET',null,link.token,true))).status,404);
  assert.equal(readBlobs,reads,'expired links never retrieve private content');
  assert.equal((await endpoint._handler(ctx,request('GET',null,'bad'))).status,404);
 }finally{Date.now=realNow;global.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
});

