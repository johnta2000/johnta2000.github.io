const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../../..');
const owner = { email: 'johnta2018@gmail.com', issuer: 'https://clerk.john-ta.com', emailVerified: true };
const backend = esbuild.build({
  entryPoints: [path.join(root, 'convex/packing.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'test-handlers', setup(build) {
    build.onResolve({ filter: /\.\/_generated\/server$/ }, () => ({ path: 'server', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const query=x=>x; export const mutation=x=>x;' }));
  } }],
}).then(result => {
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, console });
  return module.exports;
});

function context(identity = owner, records = []) {
  const rows = structuredClone(records);
  let touched = 0;
  return {
    rows, get touched() { return touched; },
    auth: { getUserIdentity: async () => identity },
    db: {
      query() { touched++; let filter; return { withIndex(_, fn) { fn({ eq(key, value) { filter = record => record[key] === value; } }); return this; }, async unique() { return rows.find(filter) || null; } }; },
      async patch(id, fields) { Object.assign(rows.find(row => row._id === id), structuredClone(fields)); },
      async insert(_, fields) { rows.push({ _id: 'packing-workspace', ...structuredClone(fields) }); },
    },
  };
}
const state = () => ({ version: 1, template: [{ id: 'template', name: 'Essentials', items: [{ id: 'template-wallet', label: 'Wallet', packed: false }] }], trips: [{ id: 'trip', name: 'Test trip', sections: [{ id: 'trip-section', name: 'Essentials', items: [{ id: 'trip-wallet', label: 'Wallet', packed: true }] }] }], activeId: 'trip' });

test('every endpoint denies signed-out, other accounts, false verification, and other issuers before reading data', async () => {
  const api = await backend;
  for (const identity of [null, { ...owner, email: 'someone@example.com' }, { ...owner, emailVerified: false }, { ...owner, emailVerified: 'true' }, { ...owner, issuer: 'https://other.example.com' }, { ...owner, email: undefined }]) {
    for (const [name, args] of [['verify', {}], ['read', {}], ['save', { state: state(), expectedVersion: 0 }]]) {
      const ctx = context(identity);
      await assert.rejects(api[name].handler(ctx, args), /not authorized/);
      assert.equal(ctx.touched, 0);
    }
  }
});

test('the verified site owner and the pinned Clerk email-code flow are accepted', async () => {
  const api = await backend;
  for (const identity of [owner, { ...owner, emailVerified: undefined }, { ...owner, email: ' JohnTa2018@Gmail.com ' }]) {
    assert.equal((await api.verify.handler(context(identity), {})).email, owner.email);
  }
});

test('reads are private and do not create a workspace', async () => {
  const api = await backend;
  const ctx = context(owner, [{ _id: 'other', owner: 'other@example.com', state: state(), version: 20 }]);
  const result = await api.read.handler(ctx, {});
  assert.equal(result.state, null); assert.equal(result.version, 0); assert.equal(ctx.rows.length, 1);
});

test('saving and reloading preserve items, checkmarks, and versions', async () => {
  const api = await backend, ctx = context();
  assert.equal((await api.save.handler(ctx, { state: state(), expectedVersion: 0 })).version, 1);
  const result = await api.read.handler(ctx, {});
  assert.equal(result.version, 1);
  assert.equal(JSON.stringify(result.state), JSON.stringify(state()));
  const updated = state(); updated.trips[0].name = 'Renamed';
  assert.equal((await api.save.handler(ctx, { state: updated, expectedVersion: 1 })).version, 2);
  assert.equal(ctx.rows.length, 1); assert.equal(ctx.rows[0].owner, owner.email);
});

test('stale saves cannot overwrite another device’s changes', async () => {
  const api = await backend, ctx = context();
  await api.save.handler(ctx, { state: state(), expectedVersion: 0 });
  const stale = state(); stale.trips[0].name = 'Stale';
  await assert.rejects(api.save.handler(ctx, { state: stale, expectedVersion: 0 }), /changed on another device/);
  assert.equal(ctx.rows[0].state.trips[0].name, 'Test trip');
});

test('invalid IDs, text, active trips, and versions are rejected', async () => {
  const api = await backend;
  const invalid = [state(), state(), state(), state()];
  invalid[0].trips[0].sections[0].items[0].id = 'template-wallet';
  invalid[1].trips[0].name = ' ';
  invalid[2].trips[0].sections[0].items[0].label = 'x'.repeat(151);
  invalid[3].activeId = 'missing';
  for (const value of invalid) {
    const ctx = context();
    await assert.rejects(api.save.handler(ctx, { state: value, expectedVersion: 0 }));
    assert.equal(ctx.rows.length, 0);
  }
  await assert.rejects(api.save.handler(context(), { state: state(), expectedVersion: -1 }), /Invalid checklist version/);
});
