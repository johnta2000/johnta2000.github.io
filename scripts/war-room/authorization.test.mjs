import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=buildSync({entryPoints:[root+'convex/warRoom.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const module={exports:{}};
vm.runInNewContext(source,{module,exports:module.exports,require:createRequire(import.meta.url),console});
const api=module.exports;
const boardId='war-room-10012026';
const args={boardId,completed:{},linearLinks:{},docLinks:{}};
function context(email,verified=true){
 let reads=0,writes=0;
 const ctx={auth:{getUserIdentity:async()=>email===null?null:{subject:'test-subject',email,emailVerified:verified}},db:{
  query(){reads++;return {withIndex(){return {unique:async()=>null}}}},
  insert:async()=>{writes++;return 'test-row'},
 }};
 return {ctx,counts:()=>({reads,writes})};
}
for(const email of ['john@affil.ai','vivek@affil.ai','vishal@affil.ai','jenny@affil.ai']) {
 test(`verified ${email} can load the checklist, read progress, and save`,async()=>{
  const {ctx,counts}=context(email);
  const viewer=await api.verify._handler(ctx,{boardId});
  assert.equal(viewer.email,email);
  assert.equal(viewer.seedBuckets.length,4);
  assert.equal(await api.get._handler(ctx,{boardId}),null);
  await api.save._handler(ctx,args);
  assert.deepEqual(counts(),{reads:2,writes:1});
 });
}
for(const [name,email,verified] of [['anonymous',null,true],['unapproved','someone@affil.ai',true],['lookalike','john@affil.ai.attacker.test',true],['unverified','john@affil.ai',false],['verification missing','john@affil.ai',undefined]]) {
 test(`${name} cannot read the checklist or access saved state`,async()=>{
  const {ctx,counts}=context(email,verified);
  if(name==='verification missing')ctx.auth.getUserIdentity=async()=>({subject:'test',email});
  for(const [fn,input] of [[api.verify,{boardId}],[api.get,{boardId}],[api.save,args]]) {
   await assert.rejects(fn._handler(ctx,input));
  }
  assert.deepEqual(counts(),{reads:0,writes:0});
 });
}
test('allowlist normalizes verified email casing without allowing a different address',async()=>{
 const {ctx}=context(' JOHN@AFFIL.AI ');
 assert.equal((await api.verify._handler(ctx,{boardId})).email,'john@affil.ai');
});
test('historical rooms retain their existing access and private bootstrap stays board-scoped',async()=>{
 const {ctx}=context(null);
 assert.equal(await api.get._handler(ctx,{boardId:'war-room-06152026'}),null);
 const allowed=context('john@affil.ai');
 await assert.rejects(api.verify._handler(allowed.ctx,{boardId:'war-room-06152026'}));
});
test('public frontend no longer embeds the access password or launch checklist',()=>{
 const frontend=readFileSync(root+'war-room-10012026/app.js','utf8');
 assert.doesNotMatch(frontend,/ACCESS_PASSWORD|corgi124|const seedBuckets = \[/);
 assert.match(frontend,/let seedBuckets = \[\]/);
});

for (const email of [null, 'outsider@affil.ai']) {
 test(`launch status endpoints reject ${email ?? 'anonymous'} before any database access`, async()=>{
  const {ctx,counts}=context(email);
  await assert.rejects(api.getLaunchStatuses._handler(ctx,{}));
  await assert.rejects(api.setLaunchStatus._handler(ctx,{milestone:'ihg',status:'on-track'}));
  assert.deepEqual(counts(),{reads:0,writes:0});
 });
}
test('milestone updates preserve other statuses, checklist progress, and links',async()=>{
 let row={_id:'board',...args,completed:{existing:true},linearLinks:{ticket:'https://example.com'},launchStatuses:{united:{status:'no-mans-land',updatedAt:1,updatedBy:'vivek@affil.ai'}}};
 const {ctx}=context('john@affil.ai');
 ctx.db.query=()=>({withIndex:()=>({unique:async()=>row})});
 ctx.db.patch=async(id,patch)=>{assert.equal(id,'board');row={...row,...patch}};
 const entry=await api.setLaunchStatus._handler(ctx,{milestone:'ihg',status:'behind-schedule'});
 assert.equal(entry.updatedBy,'john@affil.ai');
 assert.equal(row.launchStatuses.united.status,'no-mans-land');
 assert.equal(row.launchStatuses.ihg.status,'behind-schedule');
 assert.equal(row.completed.existing,true);
 assert.equal(row.linearLinks.ticket,'https://example.com');
 await api.save._handler(ctx,{...args,completed:{existing:true,newCheck:true}});
 assert.equal(row.launchStatuses.ihg.status,'behind-schedule');
 assert.equal(row.launchStatuses.united.status,'no-mans-land');
 assert.deepEqual(await api.getLaunchStatuses._handler(ctx,{}),row.launchStatuses);
});
test('first status creates a board compatible with the existing checklist save',async()=>{
 const {ctx}=context('jenny@affil.ai');let inserted;
 ctx.db.insert=async(table,value)=>{assert.equal(table,'warRoomState');inserted=value;return 'new-board'};
 await api.setLaunchStatus._handler(ctx,{milestone:'bofa-deadline',status:'on-track'});
 assert.equal(inserted.boardId,boardId);
 assert.equal(inserted.launchStatuses['bofa-deadline'].updatedBy,'jenny@affil.ai');
 assert.deepEqual(Object.keys(inserted.completed),[]);
});
