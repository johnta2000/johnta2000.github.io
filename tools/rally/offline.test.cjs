const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(storage = new Map()) {
  const context = {location:{protocol:'https:'}, navigator:{onLine:true}, Event, localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}, window:{dispatchEvent(){}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/offline.js','utf8'),context);
  return {cache:context.window.RallyOffline, storage};
}
const room = (ids=['a']) => ({id:'festival',members:[{id:'me',name:'John'},{id:'other',name:'Jessi'}],currentMemberId:'me',currentLineupFavorites:ids,lineupInterests:{a:[{id:'me'},{id:'other'}]}});
const plain = v => JSON.parse(JSON.stringify(v));
test('snapshots and queued favorites survive a cold reload, scoped by account', () => {
  const {cache,storage}=setup(); cache.identify('user1'); cache.save(room()); cache.queue('festival',['b']);
  const loaded=setup(storage).cache;
  assert.deepEqual(plain(loaded.room('festival').currentLineupFavorites),['b']);
  assert.equal(loaded.room('festival').lineupInterests.a[0].id,'other');
  loaded.identify('user2'); assert.equal(loaded.room('festival'),null); assert.equal(loaded.pendingCount,0);
});
test('sync applies local additions/removals without deleting unrelated remote favorites', async () => {
  const {cache}=setup(); cache.identify('user1'); cache.save(room()); cache.queue('festival',['b']);
  let saved;
  await cache.flush(async(kind,path,args)=>{ if(kind==='query')return room(['a','remote']); saved=args.payload.artistIds; return room(saved); },'user1');
  assert.deepEqual(plain(saved),['remote','b']); assert.equal(cache.pendingCount,0);
});
test('failed sync preserves queue; wrong account cannot sync',async()=>{
  const {cache}=setup();cache.identify('user1');cache.save(room());cache.queue('festival',['b']);
  await assert.rejects(cache.flush(async()=>{throw new Error('offline')},'user1'));
  assert.equal(cache.pendingCount,1);
  await cache.flush(async()=>{throw new Error('must not run')},'user2');
  assert.equal(cache.pendingCount,1);
});
test('edits during a sync remain queued and merge on retry',async()=>{
  const {cache}=setup();cache.identify('user1');cache.save(room());cache.queue('festival',['b']);
  await cache.flush(async(kind,path,args)=>{
    if(kind==='query')return room(['a','remote']);
    cache.queue('festival',['b','c']);return room(args.payload.artistIds);
  },'user1');
  assert.equal(cache.pendingCount,1);
  assert.deepEqual(plain(cache.room('festival').currentLineupFavorites),['remote','b','c']);
  await cache.flush(async(kind,path,args)=>kind==='query'?room(['remote','b']):room(args.payload.artistIds),'user1');
  assert.equal(cache.pendingCount,0);
  assert.deepEqual(plain(cache.room('festival').currentLineupFavorites),['remote','b','c']);
});
test('revoked rooms and sign-out remove snapshots and queued data',()=>{
  const {cache}=setup();cache.identify('user1');cache.save(room());cache.queue('festival',['b']);cache.list([]);
  assert.equal(cache.room('festival'),null);assert.equal(cache.pendingCount,0);
  cache.save(room());cache.clear();assert.equal(cache.userId,null);assert.equal(cache.room('festival'),null);
});
