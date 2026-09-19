const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(__dirname+'/crew-location.js','utf8');
const server={module:{exports:{}},require};
vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rallyLocationRules.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,server);
test('GPS fixes must be finite, bounded and recent',()=>{
 const fix={latitude:40,longitude:-82,accuracy:25,observedAt:1000000};
 assert.equal(server.module.exports.locationFix(fix,1000000).latitude,40);
 for(const patch of [{latitude:91},{longitude:-181},{accuracy:-1},{accuracy:Infinity},{observedAt:1},{observedAt:1100000}])assert.throws(()=>server.module.exports.locationFix({...fix,...patch},1000000));
});
function setup(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://www.john-ta.com/tools/rally/',runScripts:'outside-only'});
 let success,cleared=0,calls=[];
 Object.defineProperty(dom.window.navigator,'geolocation',{value:{watchPosition(fn){success=fn;return 7;},clearWatch(){cleared++;}}});
 dom.window.eval(source);
 const ctx={root:dom.window.document.getElementById('root'),owner:'user',room:{id:'event',currentMemberId:'me',members:[{id:'me',name:'Me'},{id:'friend',name:'Friend'}]},query:async()=>[],mutate:async(op,id,position)=>{calls.push({op,id,position});return {expiresAt:Date.now()+1800000};}};
 return {dom,ctx,calls,fix:()=>success({coords:{latitude:40,longitude:-82,accuracy:10},timestamp:Date.now()}),cleared:()=>cleared};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('server endpoints enforce membership, self ownership, session revocation and expiry',async()=>{
 const mod={module:{exports:{}},require,structuredClone,TextEncoder,crypto:require('node:crypto').webcrypto};
 vm.runInNewContext(buildSync({entryPoints:[__dirname+'/../../convex/rally.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,mod);
 const api=mod.module.exports;let row=null,identity={subject:'u',email:'me@example.com',emailVerified:true},scheduled=0;
 const room={members:[{id:'me',clerkSubject:'u',email:'me@example.com',name:'Me'}]};
 const ctx={auth:{getUserIdentity:async()=>identity},scheduler:{runAfter:async()=>scheduled++},db:{
  query:table=>({withIndex(){return this;},unique:async()=>table==='warRoomState'?{buckets:room}:row,collect:async()=>row?[row]:[]}),
  insert:async(table,value)=>{row={_id:'row',...value};return 'row';},delete:async()=>{row=null;},patch:async(id,value)=>Object.assign(row,value),get:async()=>row
 }};
 const args={eventId:'event',sessionId:'session',operation:'start'};
 identity=null;await assert.rejects(api.crewLocations._handler(ctx,{eventId:'event'}));
 identity={subject:'stranger',email:'stranger@example.com'};await assert.rejects(api.shareCrewLocation._handler(ctx,args));
 identity={subject:'u',email:'me@example.com'};await api.shareCrewLocation._handler(ctx,args);assert.equal(row.memberId,'me');assert.equal(scheduled,1);
 await api.shareCrewLocation._handler(ctx,{...args,operation:'update',position:{latitude:40,longitude:-82,accuracy:10,observedAt:Date.now()}});
 assert.equal((await api.crewLocations._handler(ctx,{eventId:'event'})).length,1);
 await api.shareCrewLocation._handler(ctx,{...args,operation:'stop',sessionId:'old'});assert.ok(row);
 await api.shareCrewLocation._handler(ctx,{...args,operation:'stop'});assert.equal(row,null);
 await assert.rejects(api.shareCrewLocation._handler(ctx,{...args,operation:'update',position:{}}));
 await api.shareCrewLocation._handler(ctx,args);row.expiresAt=0;assert.equal((await api.crewLocations._handler(ctx,{eventId:'event'})).length,0);
 await api.expireCrewLocation._handler(ctx,{id:'row'});assert.equal(row,null);
});
test('no automatic permission prompt; local position does not publish; unmount clears GPS',async()=>{
 const s=setup();s.dom.window.RallyCrewLocation.mount(s.ctx);await tick();
 assert.equal(s.calls.length,0);
 s.ctx.root.querySelector('[data-locate]').click();s.fix();await tick();assert.equal(s.calls.length,0);
 s.dom.window.RallyCrewLocation.unmount();assert.ok(s.cleared()>0);s.dom.window.close();
});
test('expired locations disappear, malformed data rejected, relative map escapes names',()=>{
 const s=setup(),api=s.dom.window.RallyCrewLocation;
 const p={latitude:40,longitude:-82,accuracy:20,observedAt:Date.now(),expiresAt:Date.now()+10000};
 assert.equal(api.fresh([p,{...p,expiresAt:0},{...p,latitude:NaN}]).length,1);
 assert.ok(api.plot([{...p,name:'<script>',memberId:'friend'}],null).includes('&lt;script&gt;'));
 assert.equal(api.offset(p,p).x,0);s.dom.window.close();
});
test('sharing requires explicit click and stop revokes the same session',async()=>{
 const s=setup();s.dom.window.RallyCrewLocation.mount(s.ctx);await tick();
 s.ctx.root.querySelector('[data-share]').click();await tick();assert.equal(s.calls[0].op,'start');
 s.ctx.root.querySelector('[data-stop]').click();await tick();assert.equal(s.calls[1].op,'stop');assert.equal(s.calls[0].id,s.calls[1].id);
 s.dom.window.RallyCrewLocation.unmount();s.dom.window.close();
});
