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
for(const email of ['john@affil.ai','vivek@affil.ai','vishal@affil.ai','jenny@affil.ai','johnta2018@gmail.com','tothandrew22@gmail.com']) {
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
test('archived rooms require their explicit owners and private bootstrap stays board-scoped',async()=>{
 const {ctx,counts}=context(null);
 await assert.rejects(api.get._handler(ctx,{boardId:'war-room-06152026'}));
 assert.deepEqual(counts(),{reads:0,writes:0});
 const allowed=context('john@affil.ai');
 assert.equal(await api.get._handler(allowed.ctx,{boardId:'war-room-06152026'}),null);
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


test('site Clerk email-code identities work when the optional verification claim is absent',async()=>{
 for(const email of ['johnta2018@gmail.com','john@affil.ai','vivek@affil.ai','vishal@affil.ai','jenny@affil.ai']) {
  const {ctx}=context(email);
  ctx.auth.getUserIdentity=async()=>({subject:'email-code-user',issuer:'https://clerk.john-ta.com',email});
  assert.equal((await api.verify._handler(ctx,{boardId})).email,email);
  await api.get._handler(ctx,{boardId});
  await api.save._handler(ctx,args);
  await api.getLaunchStatuses._handler(ctx,{});
  await api.setLaunchStatus._handler(ctx,{milestone:'ihg',status:'on-track'});
 }
});
test('the email-code fallback never accepts another issuer, unapproved email, or failed verification',async()=>{
 const base={subject:'email-code-user',issuer:'https://clerk.john-ta.com',email:'johnta2018@gmail.com'};
 for(const change of [{issuer:'https://other.example'},{issuer:'https://clerk.john-ta.com.attacker.example'},{email:'other@gmail.com'},{email:undefined},{emailVerified:false},{emailVerified:null},{emailVerified:'true'}]) {
  const {ctx,counts}=context(base.email);
  ctx.auth.getUserIdentity=async()=>({...base,...change});
  for(const [fn,input] of [[api.verify,{boardId}],[api.get,{boardId}],[api.save,args],[api.getLaunchStatuses,{}],[api.setLaunchStatus,{milestone:'ihg',status:'on-track'}],[api.getProjectNotes,{}],[api.setProjectNote,{project:'ihg',text:'draft'}]])await assert.rejects(fn._handler(ctx,input));
  assert.deepEqual(counts(),{reads:0,writes:0});
 }
});


test('project notes save independently, can be cleared, and survive checklist/status updates',async()=>{
 let row={_id:'board',...args,completed:{existing:true},projectNotes:{united:{text:'United notes',updatedAt:1,updatedBy:'vivek@affil.ai'}}};
 const {ctx}=context('johnta2018@gmail.com');
 ctx.db.query=()=>({withIndex:()=>({unique:async()=>row})});
 ctx.db.patch=async(id,patch)=>{row={...row,...patch}};
 await api.setProjectNote._handler(ctx,{project:'ihg',text:'Line one\nLine two'});
 assert.equal(row.projectNotes.ihg.text,'Line one\nLine two');
 assert.equal(row.projectNotes.united.text,'United notes');
 await api.save._handler(ctx,{...args,completed:{existing:true,newCheck:true}});
 await api.setLaunchStatus._handler(ctx,{milestone:'ihg',status:'on-track'});
 assert.equal(row.projectNotes.ihg.text,'Line one\nLine two');
 await api.setProjectNote._handler(ctx,{project:'ihg',text:''});
 assert.equal(row.projectNotes.ihg.text,'');
 assert.equal(row.projectNotes.united.text,'United notes');
 assert.equal(row.completed.newCheck,true);
 assert.equal(row.launchStatuses.ihg.status,'on-track');
 assert.deepEqual(await api.getProjectNotes._handler(ctx,{}),row.projectNotes);
 await assert.rejects(api.setProjectNote._handler(ctx,{project:'ihg',text:'x'.repeat(10001)}));
});
test('anonymous project notes requests cannot read or write',async()=>{
 const {ctx,counts}=context(null);
 await assert.rejects(api.getProjectNotes._handler(ctx,{}));
 await assert.rejects(api.setProjectNote._handler(ctx,{project:'ihg',text:'test'}));
 assert.deepEqual(counts(),{reads:0,writes:0});
});

test('project close and reopen preserve tickets, notes, statuses, and other project closures',async()=>{
 let row={_id:'board',...args,completed:{existing:true},projectNotes:{ihg:{text:'Keep this'}},launchStatuses:{ihg:{status:'on-track'},'project:united':{closed:true,updatedAt:1}}};
 const {ctx}=context('john@affil.ai');
 ctx.db.query=()=>({withIndex:()=>({unique:async()=>row})});
 ctx.db.patch=async(id,patch)=>{row={...row,...patch}};
 await api.setProjectClosed._handler(ctx,{project:'bofa-apr',closed:true});
 assert.equal((await api.getProjectClosures._handler(ctx,{}))['bofa-apr'].closed,true);
 await api.save._handler(ctx,{...args,completed:{existing:true}});
 await api.setLaunchStatus._handler(ctx,{milestone:'ihg',status:'behind-schedule'});
 assert.equal(row.launchStatuses['project:bofa-apr'].closed,true);
 await api.setProjectClosed._handler(ctx,{project:'bofa-apr',closed:false});
 assert.equal(row.launchStatuses['project:bofa-apr'].closed,false);
 assert.equal(row.launchStatuses['project:united'].closed,true);
 assert.equal(row.projectNotes.ihg.text,'Keep this');
 assert.equal(row.completed.existing,true);
 assert.equal(row.launchStatuses.ihg.status,'behind-schedule');
});

test('project closure endpoints reject anonymous and unapproved users',async()=>{
 for (const email of [null,'outsider@affil.ai']) {
  const {ctx,counts}=context(email);
  await assert.rejects(api.getProjectClosures._handler(ctx,{}));
  await assert.rejects(api.setProjectClosed._handler(ctx,{project:'ihg',closed:true}));
  assert.deepEqual(counts(),{reads:0,writes:0});
 }
});
