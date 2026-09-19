const {test}=require('node:test');const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const sandbox={module:{exports:{}},require,TextEncoder,structuredClone,crypto};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rally.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,sandbox);
const api=sandbox.module.exports;
test('Lost Lands windows are only Sep 18–20 nights, 7 PM–2 AM Eastern, end-exclusive',()=>{
 const rules={module:{exports:{}},require};vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyLocationRules.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,rules);
 const {sharingWindow,LOST_LANDS_SHARING_WINDOWS:windows}=rules.module.exports;
 assert.equal(windows.length,3);
 for(const w of windows){assert.equal(w.end-w.start,7*3600000);assert.equal(sharingWindow('lost-lands-2026',w.start-1),undefined);assert.ok(sharingWindow('lost-lands-2026',w.start));assert.ok(sharingWindow('lost-lands-2026',w.end-1));assert.equal(sharingWindow('lost-lands-2026',w.end),undefined);}
 assert.equal(sharingWindow('lost-lands-2026',Date.parse('2026-09-21T23:00Z')),undefined);
});
function setup(){
 let identity={subject:'u',email:'a@example.com'},rows=[],seq=0;
 const room={name:'Festival',members:[{id:'me',clerkSubject:'u',email:'a@example.com'}]};
 const ctx={auth:{getUserIdentity:async()=>identity},scheduler:{runAfter:async()=>{}},db:{
  query(table){let filters={};return {withIndex(name,fn){const q={eq(k,v){filters[k]=v;return q;}};fn(q);return this;},async collect(){return table==='rallyNativeTracking'?rows.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)):[];},async unique(){if(table==='warRoomState')return {buckets:room};return (await this.collect())[0]||null;}};},
  insert:async(table,value)=>{const _id=String(++seq);rows.push({_id,...value});return _id;},
  get:async id=>rows.find(r=>r._id===id),delete:async id=>{rows=rows.filter(r=>r._id!==id);},patch:async(id,patch)=>Object.assign(rows.find(r=>r._id===id),patch)
 }};
 return {ctx,room,rows:()=>rows,identity:v=>identity=v};
}
test('native capability is hashed, scoped, short-lived, and cannot be created anonymously',async()=>{
 const s=setup();s.identity(null);await assert.rejects(api.startNativeTracking._handler(s.ctx,{eventId:'event'}));
 s.identity({subject:'u',email:'a@example.com'});const c=await api.startNativeTracking._handler(s.ctx,{eventId:'event'});
 assert.equal(c.token.length,72);assert.equal(c.memberId,'me');assert.ok(c.expiresAt<=Date.now()+1800000);
 assert.notEqual(s.rows()[0].tokenHash,c.token);assert.equal(s.rows()[0].token,undefined);
 assert.equal((await api.uploadNativeTracking._handler(s.ctx,{token:'x'.repeat(72),points:[]})).active,false);
 const point={latitude:40,longitude:-82,accuracy:10,observedAt:Date.now()};
 assert.equal((await api.uploadNativeTracking._handler(s.ctx,{token:c.token,points:[point]})).active,true);
 await api.uploadNativeTracking._handler(s.ctx,{token:c.token,points:[point]});assert.equal(s.rows()[0].points.length,1);
 const visible=await api.crewLocations._handler(s.ctx,{eventId:'event'});assert.equal(visible.length,1);assert.equal(visible[0].trail.length,1);assert.equal(visible[0].tokenHash,undefined);
 await api.uploadNativeTracking._handler(s.ctx,{token:c.token,stop:true});assert.equal(s.rows().length,0);
 assert.equal((await api.uploadNativeTracking._handler(s.ctx,{token:c.token,points:[point]})).active,false);
});
test('membership removal, replacement sessions and expiry revoke native uploads',async()=>{
 const s=setup();const c=await api.startNativeTracking._handler(s.ctx,{eventId:'event'});
 const newer=await api.startNativeTracking._handler(s.ctx,{eventId:'event'});assert.equal(s.rows().length,1);
 assert.equal((await api.uploadNativeTracking._handler(s.ctx,{token:c.token,points:[]})).active,false);
 s.room.members=[];assert.equal((await api.uploadNativeTracking._handler(s.ctx,{token:newer.token,points:[]})).active,false);assert.equal(s.rows().length,0);
 s.room.members=[{id:'me',clerkSubject:'u',email:'a@example.com'}];const expired=await api.startNativeTracking._handler(s.ctx,{eventId:'event'});s.rows()[0].expiresAt=0;
 assert.equal((await api.uploadNativeTracking._handler(s.ctx,{token:expired.token,points:[]})).active,false);
});
test('native trail buffers accept bounded offline points without falsifying their capture time',async()=>{
 const s=setup(),c=await api.startNativeTracking._handler(s.ctx,{eventId:'event'});s.rows()[0].startedAt=Date.now()-600000;
 const point={latitude:40,longitude:-82,accuracy:10,observedAt:Date.now()-300000};
 await api.uploadNativeTracking._handler(s.ctx,{token:c.token,points:[point]});assert.equal(s.rows()[0].points[0].observedAt,point.observedAt);
 for(const points of [Array(61).fill(point),[{...point,latitude:91}],[{...point,observedAt:Date.now()-1900000}]])await assert.rejects(api.uploadNativeTracking._handler(s.ctx,{token:c.token,points}));
});
