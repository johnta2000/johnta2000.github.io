import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const modules = {};
for (const file of ['warRoom', 'legacyWarRoom']) {
  const source = buildSync({ entryPoints: [root + 'convex/' + file + '.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require, console });
  modules[file] = module.exports;
}
function fixture(identity) {
  let reads = 0, writes = 0;
  const ctx = { auth: { getUserIdentity: async () => identity }, db: {
    query() { reads++; return { withIndex() { return { unique: async () => null }; } }; },
    insert: async () => { writes++; return 'synthetic-row'; },
    patch: async () => { writes++; },
  } };
  return { ctx, counts: () => ({ reads, writes }) };
}
const identities = [null, { subject: 'owner', email: 'johnta2018@gmail.com', emailVerified: true }, { subject: 'operator', email: 'john@affil.ai', emailVerified: true }, { subject: 'member', email: 'vivek@affil.ai', emailVerified: true }, { subject: 'sleep-only', email: 'sleep-only@example.com', emailVerified: true }];
const forbidden = ['monitoring:dashboard', 'monitoring:any-future-dashboard', 'rally:lost-lands-2026', 'rally:any-future-event', 'unknown-private-board', 'war-room-10012026/extra', 'war-room-06152026/extra', ' Monitoring:dashboard ', ''];
test('generic reads and saves cannot reach another tool or an unregistered board, even for approved owners', async () => {
  for (const api of Object.values(modules)) for (const identity of identities) for (const boardId of forbidden) {
    const f = fixture(identity);
    await assert.rejects(api.get._handler(f.ctx, { boardId }), /FORBIDDEN/);
    await assert.rejects(api.save._handler(f.ctx, { boardId, completed: {}, linearLinks: {}, docLinks: {}, buckets: { members: [] } }), /FORBIDDEN/);
    assert.deepEqual(f.counts(), { reads: 0, writes: 0 });
  }
});
test('archives deny outsiders, launch-room-only members, and invalid owner identities before reading or saving', async () => {
  const owner = { subject: 'owner', issuer: 'https://clerk.john-ta.com', email: 'johnta2018@gmail.com' };
  const denied = [null, identities[3], identities[4], { ...owner, subject: undefined }, { ...owner, emailVerified: false }, { ...owner, emailVerified: null }, { ...owner, emailVerified: 'true' }, { ...owner, issuer: 'https://other.example' }, { ...owner, email: 'johnta2018@gmail.com.attacker.test' }];
  for (const api of Object.values(modules)) for (const identity of denied) for (const boardId of ['war-room-06122026', 'war-room-06152026']) {
    const f = fixture(identity);
    await assert.rejects(api.get._handler(f.ctx, { boardId }));
    await assert.rejects(api.save._handler(f.ctx, { boardId, completed: {}, linearLinks: {}, docLinks: {} }));
    assert.deepEqual(f.counts(), { reads: 0, writes: 0 });
  }
});
test('each archive explicitly allows the two owners, including pinned Clerk email-code identities', async () => {
  for (const api of Object.values(modules)) for (const email of ['john@affil.ai', ' JOHnta2018@GMAIL.com ']) for (const emailVerified of [true, undefined]) for (const boardId of ['war-room-06122026', 'war-room-06152026']) {
    const f = fixture({ subject: 'owner', issuer: 'https://clerk.john-ta.com', email, emailVerified });
    assert.equal(await api.get._handler(f.ctx, { boardId }), null);
    assert.equal(await api.save._handler(f.ctx, { boardId, completed: {}, linearLinks: {}, docLinks: {} }), 'synthetic-row');
    assert.deepEqual(f.counts(), { reads: 2, writes: 1 });
  }
});
