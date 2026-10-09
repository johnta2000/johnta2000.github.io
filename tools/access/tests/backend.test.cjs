const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const path = require('node:path');
const vm = require('node:vm');
let api;
let env = {};
let envReads = 0;
const area = (id, setting, fallbackSetting, requiredSettings) => ({ id, name: id, href: '/', scope: setting ? 'allowlist' : 'share', audience: [], source: setting || 'Reviewed policy', evidence: setting ? 'Live configuration' : 'Reviewed policy', read: 'Synthetic read permission', edit: 'Synthetic edit permission', manage: 'Synthetic management permission', boundary: 'Synthetic boundary', setting, fallbackSetting, requiredSettings });
const inventory = { policyReviewedAt: '2026-10-08', limitations: 'A dated review, not an automatic security scan.', tools: [area('payments', 'CARD_PAYMENTS_ALLOWED_EMAIL', undefined, ['CARD_PAYMENTS_WORKSPACE_OWNER']), area('questions', 'PAYMENT_QUESTIONS_ALLOWED_EMAIL', undefined, []), area('standups', 'STANDUPS_ALLOWED_EMAIL', 'SLEEP_ALLOWED_EMAIL', []), area('monitoring', 'MONITORING_ALLOWED_EMAIL', 'SLEEP_ALLOWED_EMAIL', []), area('rally'), area('statement-links')], findings: [{ id: 'board-bypass', severity: 'review', title: 'Synthetic finding', detail: 'Live writes were not tested.', next: 'Review', evidence: 'Synthetic evidence', affects: [] }] };
function configure(settings = {}, policy = inventory) { env = { ...settings, ACCESS_OVERVIEW_POLICY_PARTS: '1', ACCESS_OVERVIEW_POLICY_1: JSON.stringify(policy) }; }
before(async () => {
  const source = (await build({ entryPoints: [path.join(__dirname, '../../../convex/accessOverview.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'handlers', setup(build) {
    build.onResolve({ filter: /\.\/_generated\/server$/ }, () => ({ path: 'server', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const query = x => x;' }));
  } }] })).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require, process: { env: new Proxy({}, { get: (_, key) => { envReads++; return env[key]; } }) }, console });
  api = module.exports;
});
const owner = { subject: 'synthetic-owner', issuer: 'https://clerk.john-ta.com', email: 'johnta2018@gmail.com' };
function fixture(identity = owner, statements = []) {
  let reads = 0;
  const ctx = { auth: { getUserIdentity: async () => identity }, db: { query(table) {
    reads++; assert.equal(table, 'paymentStatements');
    return { withIndex(name, cb) {
      assert.equal(name, 'by_owner');
      cb({ eq(key, value) { assert.equal(key, 'owner'); assert.equal(value, 'synthetic-workspace'); } });
      return { take: async n => { assert.equal(n, 501); return statements.slice(0, n); } };
    } };
  } } };
  return { ctx, get reads() { return reads; }, run: name => api[name].handler(ctx, {}) };
}
test('both endpoints deny outsiders and invalid identities before reading settings or records', async () => {
  for (const identity of [null, { ...owner, subject: undefined }, { ...owner, email: 'outsider@example.com' }, { ...owner, email: 'john@affil.ai.attacker.example' }, { ...owner, email: undefined }, { ...owner, emailVerified: false }, { ...owner, emailVerified: null }, { ...owner, emailVerified: 'true' }, { ...owner, issuer: 'https://other.example' }]) {
    const f = fixture(identity); envReads = 0;
    for (const name of ['verify', 'overview']) await assert.rejects(f.run(name), /not authorized/);
    assert.equal(f.reads, 0); assert.equal(envReads, 0);
  }
});
test('only the two owner emails pass, normalized, with verified or pinned email-code identity', async () => {
  for (const email of ['johnta2018@gmail.com', ' JOHN@affil.ai ']) for (const emailVerified of [true, undefined]) {
    const f = fixture({ ...owner, email, emailVerified });
    assert.equal((await f.run('verify')).email, email.trim().toLowerCase()); assert.equal(f.reads, 0);
  }
});
test('current allowlists, deduplication, empty configuration, and fallbacks are faithfully reported', async () => {
  configure({ SLEEP_ALLOWED_EMAIL: ' OWNER@example.com,friend@example.com,owner@example.com ', CARD_PAYMENTS_ALLOWED_EMAIL: 'pay@example.com', PAYMENT_QUESTIONS_ALLOWED_EMAIL: 'question@example.com' });
  const result = await fixture().run('overview');
  const row = id => result.tools.find(t => t.id === id);
  assert.deepEqual(Array.from(row('standups').audience), ['friend@example.com', 'owner@example.com']);
  assert.equal(row('standups').source, 'SLEEP_ALLOWED_EMAIL'); assert.equal(row('standups').fallback, true);
  assert.equal(row('monitoring').fallback, true); assert.equal(row('payments').configured, false);
  assert.deepEqual(Array.from(row('questions').audience), ['question@example.com']);
  assert.equal(row('questions').configured, true);
  assert.ok(result.findings.some(f => f.id === 'fallback'));
  env.STANDUPS_ALLOWED_EMAIL = 'separate@example.com'; env.MONITORING_ALLOWED_EMAIL = 'monitor@example.com';
  const updated = await fixture().run('overview');
  assert.deepEqual(Array.from(updated.tools.find(t => t.id === 'standups').audience), ['separate@example.com']);
  assert.ok(!updated.findings.some(f => f.id === 'fallback'));
});
test('the statement projection returns counts only, without secrets or private record fields', async () => {
  configure({ CARD_PAYMENTS_WORKSPACE_OWNER: 'synthetic-workspace' });
  const f = fixture(owner, [{ enabled: true, token: 'NEVER-RETURN-LINK', storageId: 'NEVER-RETURN-FILE', title: 'NEVER-RETURN-TITLE' }, { enabled: false, token: 'NEVER-RETURN-LINK-2' }]);
  const result = await f.run('overview');
  assert.equal(f.reads, 1); assert.equal(result.tools.find(t => t.id === 'statement-links').linkCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /NEVER-RETURN|synthetic-workspace/);
  const capped = await fixture(owner, Array.from({ length: 502 }, () => ({ enabled: true }))).run('overview');
  assert.equal(capped.tools.find(t => t.id === 'statement-links').linkCountCapped, true);
  assert.equal(capped.tools.find(t => t.id === 'statement-links').linkCount, 501);
});
test('an absent Payments workspace does not read records or imply access is configured', async () => {
  configure(); const f = fixture(); const result = await f.run('overview');
  assert.equal(f.reads, 0); assert.equal(result.tools.find(t => t.id === 'payments').configured, false);
  assert.equal(result.tools.find(t => t.id === 'statement-links').linkCount, 0);
});
test('the overview clearly distinguishes current settings from reviewed policy and dated findings', async () => {
  configure(); const result = await fixture().run('overview');
  assert.equal(result.tools.find(t => t.id === 'payments').evidence, 'Live configuration');
  assert.equal(result.tools.find(t => t.id === 'rally').evidence, 'Reviewed policy');
  assert.equal(result.policyReviewedAt, '2026-10-08');
  assert.match(result.limitations, /not an automatic security scan/);
  assert.match(result.findings.find(f => f.id === 'board-bypass').detail, /Live writes were not tested/);
});

test('a missing or malformed private inventory fails closed', async () => {
  for (const bad of [{}, { ACCESS_OVERVIEW_POLICY_PARTS: '9' }, { ACCESS_OVERVIEW_POLICY_PARTS: '1', ACCESS_OVERVIEW_POLICY_1: '{}' }, { ACCESS_OVERVIEW_POLICY_PARTS: '2', ACCESS_OVERVIEW_POLICY_1: '{' }]) {
    env = bad; const f = fixture(); await assert.rejects(f.run('overview')); assert.equal(f.reads, 0);
  }
});
test('private inventory cannot request arbitrary environment variables or return unknown secret fields', async () => {
  const malicious = JSON.parse(JSON.stringify(inventory)); malicious.tools[0].setting = 'CLERK_SECRET_KEY';
  configure({ CLERK_SECRET_KEY: 'NEVER-RETURN-CREDENTIAL' }, malicious);
  const f = fixture(); await assert.rejects(f.run('overview'), /unsupported setting/); assert.equal(f.reads, 0);
  const accidental = JSON.parse(JSON.stringify(inventory)); accidental.tools[0].token = 'NEVER-RETURN-CREDENTIAL'; accidental.findings[0].secret = 'NEVER-RETURN-CREDENTIAL';
  configure({}, accidental); assert.doesNotMatch(JSON.stringify(await fixture().run('overview')), /NEVER-RETURN-CREDENTIAL/);
});
