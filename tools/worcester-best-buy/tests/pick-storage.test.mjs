import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStore, selectionKey } from '../pick-storage.mjs';

const coffee = { picks: '156', base: 0, extra: true };
const pair = { picks: '133.156', base: 0, extra: true };
const comparison = { picks: '51.111.156x2', base: 420, extra: false };

function memory() {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
}

test('the same wishlist is saved once, including when Share races the autosave', async () => {
  const calls = [];
  const store = pickStore({ request: async (method, value) => { calls.push([method, value]); return 'shared'; } });
  const [a, b] = await Promise.all([store.save(coffee), store.save(coffee)]);
  assert.equal(a, b);
  assert.deepEqual(calls, [['save', coffee]]);
  assert.equal(await store.save(coffee), 'shared');
  assert.equal(calls.length, 1);
});

test('rapid edits stay recoverable when the earlier save finishes last', async () => {
  const storage = memory();
  const resolvers = new Map();
  const store = pickStore({ storage, request: (_, value) => new Promise(resolve => resolvers.set(value.picks, resolve)) });
  store.recover(coffee);
  const first = store.save(coffee);
  store.recover(pair);
  const second = store.save(pair);
  await Promise.resolve();
  resolvers.get(pair.picks)('pair');
  await second;
  resolvers.get(coffee.picks)('coffee');
  await first;
  const reopened = pickStore({ storage });
  assert.deepEqual(reopened.last(), pair);
  assert.equal(reopened.savedId(pair), 'pair');
  assert.deepEqual(await reopened.load('pair'), pair);
});

test('an offline save can be retried and a failed shared link never resolves to empty picks', async () => {
  const storage = memory();
  let offline = true;
  const store = pickStore({ storage, request: async method => {
    if (offline) throw new Error('offline');
    return method === 'get' ? null : 'saved';
  } });
  store.recover(comparison);
  await assert.rejects(store.save(comparison));
  assert.deepEqual(pickStore({ storage }).last(), comparison);
  await assert.rejects(store.load('missing'));
  offline = false;
  await assert.rejects(store.load('missing'));
  assert.equal(await store.save(comparison), 'saved');
});

test('a recipient can edit a shared list without changing the original snapshot', async () => {
  const backend = new Map();
  const request = async (method, args) => {
    if (method === 'get') return backend.get(args.id) || null;
    const id = 'list-' + selectionKey(args);
    backend.set(id, { ...args });
    return id;
  };
  const first = pickStore({ request });
  const original = await first.save(coffee);
  const recipient = pickStore({ request });
  assert.deepEqual(await recipient.load(original), coffee);
  const edited = await recipient.save(comparison);
  assert.notEqual(edited, original);
  assert.deepEqual(await pickStore({ request }).load(original), coffee);
  assert.deepEqual(await pickStore({ request }).load(edited), comparison);
});

import { applyChange, changedItems } from '../family-picks.mjs';
import { familyStore } from '../family-store.mjs';

function persistentMemory() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: i => [...data.keys()][i],
    getItem: key => data.get(key),
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

test('family picks from two devices merge and quantity adjustments use the confirmed count', () => {
  const otherPick = {items:[{id:133,count:1,relative:false}]};
  const addCoffee = {items:[{id:156,count:1,relative:true}]};
  const combined = applyChange(applyChange(coffee,otherPick),addCoffee);
  assert.deepEqual(combined,{...coffee,picks:'133.156x2'});
  assert.deepEqual(applyChange(combined,{items:[],base:0,extra:false}),{...combined,extra:false});
  assert.deepEqual(changedItems(new Map([['item-156',1]]),new Map([['item-133',1],['item-156',1]])),otherPick.items);
});

test('an acknowledged family edit with a lost response recovers after reload without doubling the quantity', async () => {
  const storage = persistentMemory();
  let state = { ...coffee, version:0 };
  let dropResponse = true;
  const applied = new Set();
  const request = async (method,args) => {
    if (method === 'getFamily') return state;
    if (!applied.has(args.request)) {
      state = { ...applyChange(state,args.change),version:state.version+1 };
      applied.add(args.request);
    }
    if (dropResponse) throw new Error('Connection dropped');
    return state;
  };
  const options = { storage, request, uuid:()=>'edit-1' };
  const first = familyStore('family',options);
  await first.refresh();
  first.edit({items:[{id:156,count:1,relative:true}]});
  await first.refresh();
  assert.equal(first.phase(),'error');
  assert.equal(first.value().picks,'156x2');
  assert.equal(first.pending(),1);
  const reopened = familyStore('family',options);
  assert.equal(reopened.value().picks,'156x2');
  dropResponse = false;
  await reopened.refresh();
  assert.equal(reopened.value().picks,'156x2');
  assert.equal(reopened.phase(),'saved');
  assert.equal(reopened.pending(),0);
  assert.equal(state.version,1);
});
