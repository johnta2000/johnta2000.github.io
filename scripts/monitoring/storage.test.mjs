import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {compactSnapshot} from './compact-snapshot.mjs';
const require = createRequire(import.meta.url), esbuild = require('esbuild');
let api;
let tick = Date.parse('2026-10-18T12:00:00Z');
before(async () => {
  const result = await esbuild.build({entryPoints:[fileURLToPath(new URL('../../convex/monitoring.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{
    name:'handlers',setup(build) {
      build.onResolve({filter:/\.\/_generated\/server$/},()=>({path:'handlers',namespace:'test'}));
      build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const query=x=>x,mutation=x=>x,internalMutation=x=>x;'}));
    },
  }]});
  const module={exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require,console,crypto:webcrypto,TextEncoder,
    Date:class extends Date {static now(){return ++tick;}},process:{env:{MONITORING_ALLOWED_EMAIL:'owner@example.com',MONITORING_INGEST_SECRET:'i'.repeat(40),MONITORING_REPORT_SECRET:'r'.repeat(40)}}});
  api=module.exports;
});
const stamp = n => new Date(Date.parse('2026-10-01T00:00:00Z') + n*3600_000).toISOString();
function snapshot() {
  const monitors=[{id:'paze-directory',name:'Directory',configured:true,status:'healthy',latestRunAt:stamp(300),currentCount:100},
    ...['paze-clover-map-ranking','bilt-calculator-ranking','transfer-bonus-discovery','chase-sapphire-reserve-tables'].map(id=>({id,name:id,configured:true,status:'healthy',latestRunAt:stamp(300),metrics:{clicks:10},details:{queries:[{query:'synthetic',value:'x'.repeat(1000)}]}}))];
  const history={maxRuns:336,runs:Array.from({length:263},(_,i)=>({id:stamp(300-i),timestamp:stamp(300-i),status:'success',summary:'Synthetic directory run',diff:{added:[],removed:[],renamed:[]},evidence:'x'.repeat(400)}))};
  return {state:{schemaVersion:1,generatedAt:stamp(300),overallStatus:'healthy',monitors},history,
    baseline:{merchants:[{name:'Synthetic merchant'}]},feed:{events:Array.from({length:100},(_,i)=>({id:'event-'+i,timestamp:stamp(300-i),monitorId:'paze-directory',summary:'Synthetic change'}))},
    monitorHistory:Object.fromEntries(monitors.slice(1).map(m=>[m.id,{maxRuns:m.id==='chase-sapphire-reserve-tables'?180:60,runs:Array.from({length:m.id==='chase-sapphire-reserve-tables'?73:60},(_,i)=>({id:stamp(300-i),timestamp:stamp(300-i),monitorId:m.id,status:'healthy',details:{evidence:'x'.repeat(1400)}}))}]))};
}
function fixture() {
  const original=snapshot(), docs=[{_id:'legacy',boardId:'monitoring:dashboard',buckets:structuredClone(original),updatedAt:1}];
  const reads=[],writes=[]; let sequence=0, bytes=0;
  const db={query(table){assert.equal(table,'warRoomState');let filters=[],direction='asc';
    const q={withIndex(index,filter){assert.equal(index,'by_board');const b={eq(k,v){filters.push(r=>r[k]===v);return b;},gte(k,v){filters.push(r=>r[k]>=v);return b;},lt(k,v){filters.push(r=>r[k]<v);return b;}};filter(b);return q;},
      order(value){direction=value;return q;},async take(n){const found=docs.filter(r=>filters.every(f=>f(r))).sort((a,b)=>(direction==='asc'?1:-1)*a.boardId.localeCompare(b.boardId)).slice(0,n);
        for(const row of found){reads.push(row.boardId);bytes+=JSON.stringify(row).length;}return structuredClone(found);},
      async unique(){const found=await q.take(2);assert.ok(found.length<=1);return found[0]??null;}};return q;},
    async insert(table,values){assert.equal(table,'warRoomState');const _id='row'+ ++sequence;docs.push({_id,...structuredClone(values)});writes.push(values.boardId);return _id;},
    async patch(id,values){const row=docs.find(r=>r._id===id);assert.ok(row);Object.assign(row,structuredClone(values));writes.push(row.boardId);},
    async delete(id){const index=docs.findIndex(r=>r._id===id);assert.ok(index>=0);writes.push(docs[index].boardId);docs.splice(index,1);}};
  const ctx={db,auth:{getUserIdentity:async()=>({subject:'owner',email:'owner@example.com',emailVerified:true})}};
  const run=(name,args={})=>api[name].handler(ctx,args);
  return {docs,original,reads,writes,ctx,run,bytes:()=>bytes,reset(){reads.length=0;writes.length=0;bytes=0;}};
}
const report=(extra={})=>({monitorId:'paze-clover-map-ranking',timestamp:stamp(301),status:'healthy',summary:'Routine check',metrics:{clicks:10},details:{queries:[{query:'synthetic',value:'x'.repeat(1000)}]},sourceUrls:['https://example.com/'],meaningful:false,...extra});
const submit=(f,r)=>f.run('report',{secret:'r'.repeat(40),report:r});

test('migration preserves all retained histories, baselines and events, and leaves the original archive untouched',async()=>{
  const f=fixture();await f.run('migrateStorage');
  assert.equal(JSON.stringify(f.docs.find(r=>r._id==='legacy').buckets),JSON.stringify(f.original));
  for(const monitor of f.original.state.monitors){
    const detail=await f.run('detail',{monitorId:monitor.id});
    const expected=monitor.id==='paze-directory'?f.original.history:f.original.monitorHistory[monitor.id];
    assert.equal(JSON.stringify(detail.history.runs),JSON.stringify(expected.runs));
    if(monitor.id==='paze-directory')assert.equal(JSON.stringify(detail.baseline),JSON.stringify(f.original.baseline));
  }
  assert.equal((await f.run('changeFeed')).events.length,100);
  f.reset();await f.run('migrateStorage');assert.equal(f.writes.length,0);assert.ok(!f.reads.includes('monitoring:dashboard'));
});
test('overview reads only compact records and never loads details, runs or the archive',async()=>{
  const f=fixture();await f.run('migrateStorage');f.reset();const overview=await f.run('overview');
  assert.equal(overview.snapshot.state.monitors.length,5);assert.equal(overview.snapshot.feed.eventCount,100);
  assert.ok(overview.snapshot.state.monitors.every(m=>!m.details));
  assert.ok(f.reads.every(key=>key==='monitoring:v2:meta'||key.startsWith('monitoring:v2:summary:')));
  assert.ok(f.bytes()<JSON.stringify(f.original).length/10);
  assert.ok(JSON.stringify(overview).length<10_000);
});
test('a routine report touches only its own monitor and costs much less than reading the old snapshot once',async()=>{
  const f=fixture();await f.run('migrateStorage');f.reset();await submit(f,report());
  assert.ok(!f.reads.includes('monitoring:dashboard'));
  assert.ok(f.reads.every(key=>key==='monitoring:v2:meta'||key.includes('paze-clover-map-ranking')));
  assert.ok(f.writes.every(key=>key.includes('paze-clover-map-ranking')));
  assert.ok(f.bytes()<JSON.stringify(f.original).length/5);
  assert.equal((await f.run('detail',{monitorId:'chase-sapphire-reserve-tables'})).history.runs.length,73);
});
test('retrying an identical report makes no duplicate run, event or database write',async()=>{
  const f=fixture();await f.run('migrateStorage');const r=report({meaningful:true});await submit(f,r);f.reset();await submit(f,r);
  assert.equal(f.writes.length,0);
  const detail=await f.run('detail',{monitorId:r.monitorId});assert.equal(detail.history.runs.filter(x=>x.timestamp===r.timestamp).length,1);
});
test('out-of-order reports keep the latest status while preserving older arriving runs',async()=>{
  const f=fixture();await f.run('migrateStorage');await submit(f,report({timestamp:stamp(303),status:'alert'}));
  await submit(f,report({timestamp:stamp(302),status:'healthy'}));
  const detail=await f.run('detail',{monitorId:'paze-clover-map-ranking'});
  assert.equal(detail.monitor.latestRunAt,stamp(303));assert.equal(detail.monitor.status,'alert');
  assert.ok(detail.history.runs.some(r=>r.timestamp===stamp(302)));
});
test('compact ingestion updates one monitor without resetting externally reported monitors',async()=>{
  const f=fixture();await f.run('migrateStorage');const r=report({timestamp:stamp(302),status:'watch'});await submit(f,r);
  const next=structuredClone(f.original);next.state.monitors[0].latestRunAt=stamp(303);next.history.runs.unshift({id:stamp(303),timestamp:stamp(303),summary:'New synthetic run'});
  const compact=compactSnapshot(next,'paze-directory');f.reset();
  await f.run('ingest',{secret:'i'.repeat(40),monitorId:'paze-directory',snapshot:compact});
  assert.ok(f.writes.every(key=>key.includes('paze-directory')));
  const detail=await f.run('detail',{monitorId:r.monitorId});assert.equal(detail.monitor.status,'watch');
  assert.ok(JSON.stringify(compact).length<JSON.stringify(next).length/10);
});
test('only the opened monitor history is read, and the change feed never reads run payloads',async()=>{
  const f=fixture();await f.run('migrateStorage');f.reset();await f.run('detail',{monitorId:'bilt-calculator-ranking'});
  assert.ok(f.reads.every(key=>key.includes('bilt-calculator-ranking')));
  f.reset();await f.run('changeFeed');assert.ok(f.reads.every(key=>key==='monitoring:v2:meta'||key.startsWith('monitoring:v2:event:')||key.startsWith('monitoring:v2:summary:')));
});
test('routine checks advance feed freshness without creating a change event',async()=>{
  const f=fixture();await f.run('migrateStorage');const r=report();await submit(f,r);
  const feed=await f.run('changeFeed');assert.equal(feed.generatedAt,r.timestamp);assert.equal(feed.events.length,100);
});
test('all read endpoints reject signed-out, unverified and unauthorized people before reading data',async()=>{
  for(const identity of [null,{subject:'x',email:'other@example.com',emailVerified:true},{subject:'x',email:'owner@example.com',emailVerified:false}]){
    const f=fixture();f.ctx.auth.getUserIdentity=async()=>identity;
    for(const name of ['dashboard','overview','detail','changeFeed'])await assert.rejects(f.run(name,name==='detail'?{monitorId:'paze-directory'}:{}));
    assert.equal(f.reads.length,0);
  }
  const f=fixture();await assert.rejects(f.run('ingest',{secret:'r'.repeat(40),snapshot:f.original}));
  await assert.rejects(f.run('report',{secret:'i'.repeat(40),report:report()}));assert.equal(f.writes.length,0);
});
test('collector payload contains only its latest run and related events, without changing repository history',()=>{
  const s=snapshot(),original=JSON.stringify(s);s.feed.events.unshift({id:'chase-new',monitorId:'chase-sapphire-reserve-tables',timestamp:stamp(300)});
  const expected=JSON.stringify(s),compact=compactSnapshot(s,'chase-sapphire-reserve-tables');
  assert.equal(compact.state.monitors.length,1);assert.equal(compact.history.runs.length,0);
  assert.equal(compact.monitorHistory['chase-sapphire-reserve-tables'].runs.length,1);
  assert.equal(compact.feed.events.length,1);assert.equal(JSON.stringify(compact.baseline),'{}');
  assert.equal(JSON.stringify(s),expected);assert.notEqual(original,expected);
});
