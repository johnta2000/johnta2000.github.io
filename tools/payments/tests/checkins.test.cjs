const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
let api;
const env = { CARD_PAYMENTS_ALLOWED_EMAIL: 'owner@example.com, WORK@example.com ', CARD_PAYMENTS_WORKSPACE_OWNER: 'issuer|owner' };
before(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, '../../../convex/paymentCheckins.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'handler-test', setup(build) {
      build.onResolve({ filter: /\.\/_generated\/server$/ }, () => ({ path: 'server', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const query = x => x; export const mutation = x => x; export const internalMutation = x => x;' }));
    } }],
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, process: { env }, console, TextEncoder, TextDecoder, URL });
  api = module.exports;
});

function fixture(identity = { tokenIdentifier: 'issuer|owner', email: 'owner@example.com', emailVerified: true }) {
  const tables = { paymentAccounts: [], paymentLogs: [], paymentFiles: [], paymentCheckins: [], paymentAccountCheckins: [] }; let nextId = 1;
  const deleted = [];
  const ctx = { storage: { delete: async id => deleted.push(id) }, auth: { getUserIdentity: async () => identity }, db: {
    query(table) {
      const filters = [];
      const builder = { eq: (key, value) => { filters.push(row => row[key] === value); return builder; }, gt: (key, value) => { filters.push(row => row[key] > value); return builder; } };
      const query = {
        withIndex(name, callback) { callback(builder); return query; },
        async collect() { return tables[table].filter(row => filters.every(fn => fn(row))); },
        async unique() { const results = await query.collect(); assert.ok(results.length <= 1); return results[0] || null; },
        async take(n) { return (await query.collect()).slice(0, n); },
      }; return query;
    },
    async get(id) { return Object.values(tables).flat().find(row => row._id === id) || null; },
    async insert(table, value) { const _id = `${table}-${nextId++}`; tables[table].push({ ...value, _id }); return _id; },
    async delete(id) { for (const rows of Object.values(tables)) { const index = rows.findIndex(r => r._id === id); if (index >= 0) rows.splice(index, 1); } },
    async patch(id, fields) { const doc = await ctx.db.get(id); assert.ok(doc); Object.assign(doc, fields); },
  } };
  return { ctx, tables, deleted, run: (name, args = {}) => api[name].handler(ctx, args) };
}

test('check-ins are authorized, versioned, month-isolated, and limited to twelve months', async () => {
  for (const identity of [null, {email:'stranger@example.com',emailVerified:true}]) {
    const f = fixture(identity);
    await assert.rejects(f.run('get', {month:'2026-11'}), /not authorized/);
    await assert.rejects(f.run('save', {month:'2026-11',checked:true,expectedVersion:0}), /not authorized/);
  }
  const f = fixture();
  for (const month of ['2026-10','2027-11','2026-13']) await assert.rejects(f.run('save',{month,checked:true,expectedVersion:0}), /valid month/);
  await f.run('save',{month:'2026-11',checked:true,expectedVersion:0});
  assert.equal((await f.run('get',{month:'2026-11'})).checked,true);
  assert.equal(await f.run('get',{month:'2026-12'}),null);
  await assert.rejects(f.run('save',{month:'2026-11',checked:false,expectedVersion:0}), /changed on another device/);
  await f.run('save',{month:'2026-11',checked:false,expectedVersion:1});
  assert.equal((await f.run('get',{month:'2026-11'})).checked,false);
  assert.equal(f.tables.paymentLogs.length,0);
});

test('individual card and housing reviews are shared, reversible, month-isolated, and never mark payments paid', async () => {
  const f = fixture();
  f.tables.paymentAccounts.push(
    {_id:'card',owner:'issuer|owner',startMonth:'2026-11'},
    {_id:'rent',owner:'issuer|owner',category:'housing',startMonth:'2026-11'},
  );
  await f.run('save',{month:'2026-11',checked:true,expectedVersion:0});
  assert.equal((await f.run('accounts',{month:'2026-11'})).length,0, 'legacy bulk check does not imply individual checks');
  const save = {accountId:'card',month:'2026-11',checked:true,expectedVersion:0,requestKey:'one'};
  const first = await f.run('saveAccount',save);
  assert.equal((await f.run('saveAccount',save)).version,first.version,'retry after a lost response is idempotent');
  await f.run('saveAccount',{...save,accountId:'rent',requestKey:'rent'});
  assert.equal((await f.run('accounts',{month:'2026-11'})).length,2);
  assert.equal((await f.run('accounts',{month:'2026-12'})).length,0);
  f.ctx.auth.getUserIdentity=async()=>({email:'work@example.com',emailVerified:true});
  assert.equal((await f.run('accounts',{month:'2026-11'})).filter(c=>c.checked).length,2);
  await f.run('saveAccount',{...save,checked:false,expectedVersion:1,requestKey:'uncheck'});
  const rows=await f.run('accounts',{month:'2026-11'});
  assert.equal(rows.find(c=>c.accountId==='card').checked,false);
  assert.equal(rows.find(c=>c.accountId==='rent').checked,true);
  await f.run('saveAccount',{...save,month:'2027-11',requestKey:'future'});
  assert.equal(f.tables.paymentLogs.length,0);
});

test('individual review endpoints enforce access, active accounts, valid months, idempotence and stale-write protection', async () => {
  const args={accountId:'card',month:'2026-11',checked:true,expectedVersion:0,requestKey:'check'};
  for(const identity of [null,{email:'stranger@example.com',emailVerified:true},{email:'owner@example.com',emailVerified:false},{email:'owner@example.com'}]) {
    const f=fixture(identity);
    await assert.rejects(f.run('accounts',{month:'2026-11'}),/not authorized/);
    await assert.rejects(f.run('saveAccount',args),/not authorized/);
  }
  const f=fixture();
  f.tables.paymentAccounts.push({_id:'card',owner:'issuer|owner',startMonth:'2026-11',endMonth:'2027-01'}, {_id:'other',owner:'other',startMonth:'2020-01'});
  for(const accountId of ['missing','other']) await assert.rejects(f.run('saveAccount',{...args,accountId}),/not found/);
  for(const month of ['2026-10','2027-02']) await assert.rejects(f.run('saveAccount',{...args,month}),/not active/);
  for(const month of ['2026-00','2026-13','2026-1','garbage']) {
    await assert.rejects(f.run('accounts',{month}),/valid month/);
    await assert.rejects(f.run('saveAccount',{...args,month}),/valid month/);
  }
  await f.run('saveAccount',args);
  await assert.rejects(f.run('saveAccount',{...args,requestKey:'stale',checked:false}),/another device/);
  await assert.rejects(f.run('saveAccount',{...args,checked:false}),/Invalid check-in/);
  assert.equal(f.tables.paymentAccountCheckins[0].checked,true);
  assert.equal(f.tables.paymentAccountCheckins[0].version,1);
  f.tables.paymentAccountCheckins.push({_id:'private',owner:'other',month:'2026-11',accountId:'other',checked:true});
  assert.equal((await f.run('accounts',{month:'2026-11'})).length,1);
});
