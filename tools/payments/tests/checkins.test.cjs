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
  const tables = { paymentAccounts: [], paymentLogs: [], paymentFiles: [], paymentCheckins: [] }; let nextId = 1;
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
