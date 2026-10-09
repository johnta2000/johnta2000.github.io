const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const path = require('node:path');
const vm = require('node:vm');
const tools = {};
let env = {};
before(async () => {
  for (const name of ['standups', 'monitoring']) {
    const { outputFiles } = await build({ entryPoints: [path.join(__dirname, '../../../convex', name + '.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'handlers', setup(build) {
      build.onResolve({ filter: /\.\/_generated\/server$/ }, () => ({ path: 'server', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const query = x => ({...x, kind:"query"}); export const mutation = x => ({...x, kind:"mutation"}); export const action = x => ({...x, kind:"action"}); export const internalMutation = x => ({...x, internal:true}); export const internalAction = x => ({...x, internal:true});' }));
    } }] });
    const module = { exports: {} };
    vm.runInNewContext(outputFiles[0].text, { module, exports: module.exports, require, process: { env: new Proxy({}, { get: (_, key) => env[key] }) }, console });
    tools[name] = module.exports;
  }
});
function fixture(email, emailVerified = true) {
  let touches = 0;
  const blocked = new Proxy({}, { get() { touches++; throw Error('Unauthorized operation reached data or side effects'); } });
  const ctx = { auth: { getUserIdentity: async () => email ? { subject: 'synthetic-user', email, emailVerified } : null }, db: blocked, scheduler: blocked,
    runQuery() { touches++; throw Error('Unauthorized nested query'); }, runMutation() { touches++; throw Error('Unauthorized mutation'); }, runAction() { touches++; throw Error('Unauthorized action'); } };
  return { ctx, get touches() { return touches; } };
}
test('every user-facing Standups read, write, and action denies Sleep-only users before data or effects', async () => {
  const endpoints = Object.entries(tools.standups).filter(([, fn]) => fn.handler && !fn.internal);
  assert.ok(endpoints.some(([, fn]) => fn.kind === 'query'));
  assert.ok(endpoints.some(([, fn]) => fn.kind === 'mutation'));
  assert.ok(endpoints.some(([, fn]) => fn.kind === 'action'));
  for (const dedicated of [undefined, '', '   ', 'standups-only@example.com']) {
    env = { SLEEP_ALLOWED_EMAIL: 'sleep-only@example.com', STANDUPS_ALLOWED_EMAIL: dedicated };
    for (const [name, fn] of endpoints) {
      const f = fixture('sleep-only@example.com');
      await assert.rejects(fn.handler(f.ctx, {}), /not authorized for standups/, name);
      assert.equal(f.touches, 0, name);
    }
  }
});
test('every Monitoring viewer endpoint denies Sleep-only users before reading records', async () => {
  for (const dedicated of [undefined, '', '   ', 'monitoring-only@example.com']) {
    env = { SLEEP_ALLOWED_EMAIL: 'sleep-only@example.com', MONITORING_ALLOWED_EMAIL: dedicated };
    for (const name of ['verify', 'dashboard', 'changeFeed']) {
      const f = fixture('sleep-only@example.com');
      await assert.rejects(tools.monitoring[name].handler(f.ctx, {}), /not authorized for the monitoring dashboard/);
      assert.equal(f.touches, 0);
    }
  }
});
test('approval for one tool does not unlock the other, and explicit approval is normalized', async () => {
  env = { SLEEP_ALLOWED_EMAIL: 'sleep-only@example.com', STANDUPS_ALLOWED_EMAIL: ' STANDUPS-ONLY@example.com ', MONITORING_ALLOWED_EMAIL: 'monitoring-only@example.com' };
  assert.equal((await tools.standups.verify.handler(fixture('standups-only@example.com').ctx)).email, 'standups-only@example.com');
  await assert.rejects(tools.monitoring.verify.handler(fixture('standups-only@example.com').ctx), /not authorized/);
  assert.equal((await tools.monitoring.verify.handler(fixture(' MONITORING-ONLY@example.com ').ctx)).email, 'monitoring-only@example.com');
  await assert.rejects(tools.standups.verify.handler(fixture('monitoring-only@example.com').ctx), /not authorized/);
});
test('approved accounts still need sign-in and cannot explicitly fail email verification', async () => {
  env = { STANDUPS_ALLOWED_EMAIL: 'approved@example.com', MONITORING_ALLOWED_EMAIL: 'approved@example.com' };
  for (const tool of Object.values(tools)) for (const f of [fixture(null), fixture('approved@example.com', false)]) {
    await assert.rejects(tool.verify.handler(f.ctx), /verified email/);
    assert.equal(f.touches, 0);
  }
});
test('Monitoring ingestion keeps a separate machine permission and rejects account approval as a secret', async () => {
  env = { MONITORING_ALLOWED_EMAIL: 'approved@example.com', SLEEP_ALLOWED_EMAIL: 'sleep-only@example.com', MONITORING_INGEST_SECRET: 'synthetic-machine-secret' };
  for (const name of ['ingest', 'report']) {
    const f = fixture('approved@example.com');
    await assert.rejects(tools.monitoring[name].handler(f.ctx, { secret: 'approved@example.com' }), /authorized|secret|Forbidden/i);
    assert.equal(f.touches, 0);
  }
});
