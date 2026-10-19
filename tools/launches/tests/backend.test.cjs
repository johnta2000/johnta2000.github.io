const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const M = require('../model.js');
const { webcrypto } = require('node:crypto');
global.crypto ||= webcrypto;
const members = [{ email: 'owner@example.com', name: 'Owner' }, { email: 'teammate@example.com', name: 'Teammate' }, { email: 'third@example.com', name: 'Third' }];
const owner = { subject: 'subject-owner', issuer: 'https://clerk.john-ta.com', email: members[0].email, emailVerified: true };
const env = { NEXTCARD_LAUNCH_TEAM: JSON.stringify(members) };
const backend = esbuild.build({
  entryPoints: [path.resolve(__dirname, '../../../convex/nextcardLaunches.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'handlers', setup(build) {
    build.onResolve({ filter: /\.\/_generated\/server$/ }, () => ({ path: 'server', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const query=x=>x;export const mutation=x=>x;' }));
  } }],
}).then(result => { const module = { exports: {} }; vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, process: { env }, URL, console }); return module.exports; });
function context(identity = owner, records = {}) {
  const tables = { nextcardLaunchChannels: [], nextcardLaunches: [], ...structuredClone(records) };
  let touched = 0;
  return { tables, get touched() { return touched; }, auth: { getUserIdentity: async () => identity }, db: {
    query(table) { touched++; let result = tables[table]; return {
      withIndex(_, fn) { fn({ eq(key, value) { result = result.filter(row => row[key] === value); return this; } }); return this; },
      async unique() { return result[0] || null; }, async first() { return result[0] || null; }, async take(n) { return result.slice(0, n); },
    }; },
    async insert(table, fields) { const id = `${table}-${tables[table].length}`; tables[table].push({ _id: id, ...structuredClone(fields) }); return id; },
    async patch(id, fields) { const row = Object.values(tables).flat().find(record => record._id === id); Object.assign(row, structuredClone(fields)); },
  } };
}
const value = () => M.newLaunch(members[0].email);

test('every endpoint rejects unauthorized identities before accessing any private table', async () => {
  const api = await backend;
  for (const identity of [null, { ...owner, subject: '' }, { ...owner, email: 'stranger@example.com' }, { ...owner, issuer: 'https://wrong.example.com' }, { ...owner, emailVerified: false }, { ...owner, emailVerified: 'true' }, { ...owner, email: undefined }]) {
    for (const [name, args] of [['verify', {}], ['workspace', {}], ['initialize', {}], ['saveChannel', { key: 'test', value: M.newChannel(), expectedVersion: 0 }], ['saveLaunch', { key: 'test', value: value(), expectedVersion: 0 }]]) {
      const ctx = context(identity); await assert.rejects(api[name].handler(ctx, args), /not authorized/); assert.equal(ctx.touched, 0);
    }
  }
});
test('all configured members can enter; the pinned email-code flow may omit the optional verification claim', async () => {
  const api = await backend;
  for (const member of members) for (const emailVerified of [true, undefined]) {
    const ctx = context({ ...owner, email: ` ${member.email.toUpperCase()} `, emailVerified });
    assert.equal((await api.verify.handler(ctx, {})).email, member.email);
    assert.equal((await api.workspace.handler(ctx, {})).members.length, 3);
  }
});
test('missing, malformed, and empty access configuration deny everyone', async () => {
  const api = await backend, original = env.NEXTCARD_LAUNCH_TEAM;
  try { for (const setting of ['', '{', '{}', '[]']) { env.NEXTCARD_LAUNCH_TEAM = setting; await assert.rejects(api.verify.handler(context(), {}), /not authorized/); } }
  finally { env.NEXTCARD_LAUNCH_TEAM = original; }
});
test('initialization seeds candidate channels exactly once and never invents checked rules', async () => {
  const api = await backend, ctx = context();
  await api.initialize.handler(ctx, {}); const count = ctx.tables.nextcardLaunchChannels.length;
  assert.equal(count, 24); assert.ok(ctx.tables.nextcardLaunchChannels.every(row => row.value.ruleStatus === 'unverified'));
  ctx.tables.nextcardLaunchChannels[0].value.notes = 'Keep our private notes';
  await api.initialize.handler(ctx, {}); assert.equal(ctx.tables.nextcardLaunchChannels.length, count); assert.equal(ctx.tables.nextcardLaunchChannels[0].value.notes, 'Keep our private notes');
});
test('the team shares records, and stale writes cannot overwrite a teammate’s launch', async () => {
  const api = await backend, ctx = context();
  await api.saveLaunch.handler(ctx, { key: 'launch-a', value: value(), expectedVersion: 0 });
  const edited = value(); edited.name = 'Updated by teammate';
  await api.saveLaunch.handler({ ...ctx, auth: { getUserIdentity: async () => ({ ...owner, email: members[1].email }) } }, { key: 'launch-a', value: edited, expectedVersion: 1 });
  await assert.rejects(api.saveLaunch.handler(ctx, { key: 'launch-a', value: value(), expectedVersion: 1 }), /changed since/);
  const workspace = await api.workspace.handler(ctx, {});
  assert.equal(workspace.launches[0].value.name, 'Updated by teammate'); assert.equal(workspace.launches[0].updatedBy, members[1].email); assert.equal(workspace.launches[0].version, 2);
  assert.ok(!('_id' in workspace.launches[0]));
});
test('different launches have independent save versions', async () => {
  const api = await backend, ctx = context();
  await api.saveLaunch.handler(ctx, { key: 'a', value: value(), expectedVersion: 0 });
  await api.saveLaunch.handler(ctx, { key: 'b', value: value(), expectedVersion: 0 });
  await api.saveLaunch.handler(ctx, { key: 'b', value: value(), expectedVersion: 1 });
  assert.equal((await api.saveLaunch.handler(ctx, { key: 'a', value: value(), expectedVersion: 1 })).version, 2);
});
test('channel edits preserve history records and reject stale or unsafe data', async () => {
  const api = await backend, ctx = context(), channel = M.newChannel(); channel.name = 'Synthetic group';
  await api.saveChannel.handler(ctx, { key: 'channel', value: channel, expectedVersion: 0 });
  channel.archived = true; await api.saveChannel.handler(ctx, { key: 'channel', value: channel, expectedVersion: 1 });
  await assert.rejects(api.saveChannel.handler(ctx, { key: 'channel', value: channel, expectedVersion: 1 }), /changed since/);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.com']) await assert.rejects(api.saveChannel.handler(ctx, { key: 'bad', value: { ...channel, url }, expectedVersion: 0 }), /http or https/);
  await assert.rejects(api.saveChannel.handler(ctx, { key: 'bad', value: { ...channel, ruleStatus: 'verified' }, expectedVersion: 0 }), /checked date/);
});
test('launch writes validate owners, dates, links, task IDs, destination references, and limits', async () => {
  const api = await backend;
  const invalid = [];
  const ownerValue = value(); ownerValue.owner = 'stranger@example.com'; invalid.push(ownerValue);
  const badDate = value(); badDate.dueDate = '2026-02-30'; invalid.push(badDate);
  const badUrl = value(); badUrl.sourceUrl = 'javascript:alert(1)'; invalid.push(badUrl);
  const duplicate = value(); duplicate.checks.push(...[0, 1].map(() => ({ id: 'same-id', label: 'Saved item', stage: 'prepare', done: false, owner: '' }))); invalid.push(duplicate);
  const tooLong = value(); tooLong.name = 'x'.repeat(151); invalid.push(tooLong);
  const missing = value(); missing.tasks.push(M.addTask({ key: 'missing', value: { name: 'Missing', kind: 'reddit' } })); invalid.push(missing);
  for (const item of invalid) { const ctx = context(); await assert.rejects(api.saveLaunch.handler(ctx, { key: 'invalid', value: item, expectedVersion: 0 })); assert.equal(ctx.tables.nextcardLaunches.length, 0); }
  await assert.rejects(api.saveLaunch.handler(context(), { key: 'bad key', value: value(), expectedVersion: 0 }), /Invalid record key/);
  await assert.rejects(api.saveLaunch.handler(context(), { key: 'x', value: value(), expectedVersion: -1 }), /Invalid saved version/);
});


test('hidden channel choices are optional, saved per launch, bounded, and cannot overlap selected tasks', async () => {
  const api = await backend, ctx = context(), old = value(); delete old.hiddenChannelKeys;
  await api.saveLaunch.handler(ctx, { key: 'old', value: old, expectedVersion: 0 });
  const hidden = value(); hidden.hiddenChannelKeys = ['irrelevant'];
  await api.saveLaunch.handler(ctx, { key: 'hidden', value: hidden, expectedVersion: 0 });
  assert.deepEqual(ctx.tables.nextcardLaunches[1].value.hiddenChannelKeys, ['irrelevant']);
  assert.equal(ctx.tables.nextcardLaunches[0].value.hiddenChannelKeys, undefined);
  for (const keys of [['bad key'], ['same', 'same'], Array.from({ length: 501 }, (_, i) => `key-${i}`)]) {
    await assert.rejects(api.saveLaunch.handler(ctx, { key: 'invalid', value: { ...value(), hiddenChannelKeys: keys }, expectedVersion: 0 }));
  }
  const overlap = value(); overlap.hiddenChannelKeys = ['channel']; overlap.tasks.push(M.addTask({ key: 'channel', value: { name: 'Channel', kind: 'reddit' } }));
  await assert.rejects(api.saveLaunch.handler(ctx, { key: 'invalid', value: overlap, expectedVersion: 0 }), /cannot also be hidden/);
});


test('posting account labels are optional per-channel launch data, limited in length, and version protected', async () => {
  const api = await backend, ctx = context();
  await api.initialize.handler(ctx, {});
  const destination = ctx.tables.nextcardLaunchChannels[0], launch = value();
  launch.tasks.push(M.addTask(destination)); delete launch.tasks[0].postingAs;
  await api.saveLaunch.handler(ctx, { key: 'old-assignment', value: launch, expectedVersion: 0 });
  launch.tasks[0].postingAs = '@synthetic-poster / Jenny';
  await api.saveLaunch.handler(ctx, { key: 'old-assignment', value: launch, expectedVersion: 1 });
  assert.equal(ctx.tables.nextcardLaunches[0].value.tasks[0].postingAs, '@synthetic-poster / Jenny');
  await assert.rejects(api.saveLaunch.handler(ctx, { key: 'old-assignment', value: launch, expectedVersion: 1 }), /changed since/);
  const invalid = structuredClone(launch); invalid.tasks[0].postingAs = 'x'.repeat(151);
  await assert.rejects(api.saveLaunch.handler(ctx, { key: 'invalid-account', value: invalid, expectedVersion: 0 }), /too long/);
  launch.tasks[0].postingAs = '';
  await api.saveLaunch.handler(ctx, { key: 'old-assignment', value: launch, expectedVersion: 2 });
  assert.equal(ctx.tables.nextcardLaunches[0].value.tasks[0].postingAs, '');
});
