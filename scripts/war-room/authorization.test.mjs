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
