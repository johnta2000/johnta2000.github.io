const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
let api;
const env = { CARD_PAYMENTS_ALLOWED_EMAIL: 'owner@example.com, WORK@example.com ', CARD_PAYMENTS_WORKSPACE_OWNER: 'issuer|owner' };
before(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, '../../../convex/cardPayments.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'handler-test', setup(build) {
      build.onResolve({ filter: /\.\/_generated\/server$/ }, () => ({ path: 'server', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const query = x => x; export const mutation = x => x;' }));
    } }],
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, process: { env }, console, TextEncoder, TextDecoder, URL });
  api = module.exports;
});

function fixture(identity = { tokenIdentifier: 'issuer|owner', email: 'owner@example.com', emailVerified: true }) {
  const tables = { paymentAccounts: [], paymentLogs: [] }; let nextId = 1;
  const ctx = { auth: { getUserIdentity: async () => identity }, db: {
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
    async patch(id, fields) { const doc = await ctx.db.get(id); assert.ok(doc); Object.assign(doc, fields); },
  } };
  return { ctx, tables, run: (name, args = {}) => api[name].handler(ctx, args) };
}
const account = { person: 'Alex', bank: 'Example Bank', nickname: '', dueDay: 1 };
async function seeded() {
  const f = fixture(); await f.run('addAccounts', { startMonth: '2026-09', accounts: [account] });
  return { ...f, id: f.tables.paymentAccounts[0]._id };
}

test('every endpoint rejects signed-out, unverified, untrusted missing-verification, and unapproved identities', async () => {
  for (const identity of [null, { email: 'stranger@example.com', emailVerified: true }, { email: 'owner@example.com', emailVerified: false }, { email: 'owner@example.com' }]) {
    const f = fixture(identity);
    for (const name of ['verify', 'dashboard', 'addAccounts', 'save', 'retire', 'updateAccount']) await assert.rejects(f.run(name, {}), /not authorized/);
    assert.equal(f.tables.paymentAccounts.length, 0);
  }
});

test('only exact configured emails are accepted, including case-insensitive comparison', async () => {
  assert.equal((await fixture({ tokenIdentifier: 'issuer|owner', email: 'OWNER@example.com', emailVerified: true }).run('verify')).email, 'OWNER@example.com');
  for (const email of ['second@example.com', 'owner+other@example.com', 'owner@example.com.attacker.example']) await assert.rejects(fixture({ tokenIdentifier: 'issuer|other', email, emailVerified: true }).run('verify'), /not authorized/);
});
test('the site’s signed email-code session works when the optional verification claim is omitted', async () => {
  const f = fixture({ tokenIdentifier: 'https://clerk.john-ta.com|user_gmail', issuer: 'https://clerk.john-ta.com', email: 'owner@example.com' });
  assert.equal((await f.run('verify')).email, 'owner@example.com');
  await f.run('addAccounts', { startMonth: '2026-09', accounts: [account] });
  const id = f.tables.paymentAccounts[0]._id;
  await f.run('save', { accountId: id, month: '2026-09', status: 'paid', expectedVersion: 0 });
  f.ctx.auth.getUserIdentity = async () => ({ tokenIdentifier: 'https://clerk.john-ta.com|user_work', issuer: 'https://clerk.john-ta.com', email: 'work@example.com' });
  const result = await f.run('dashboard', { month: '2026-09' });
  assert.equal(result.logs[0].status, 'paid');
  await f.run('updateAccount', { accountId: id, ...account, dueDay: 2 });
  await f.run('retire', { accountId: id, endMonth: '2026-09' });
});
test('missing claims do not bypass the issuer, email allowlist, or an explicit failed verification', async () => {
  const base = { tokenIdentifier: 'issuer|other', issuer: 'https://clerk.john-ta.com', email: 'owner@example.com' };
  for (const change of [{ issuer: 'https://other.clerk.accounts.dev' }, { issuer: 'https://clerk.john-ta.com.attacker.example' }, { email: 'stranger@example.com' }, { email: undefined }, { emailVerified: false }, { emailVerified: null }, { emailVerified: 'true' }]) {
    const f = fixture({ ...base, ...change });
    for (const name of ['verify', 'dashboard', 'addAccounts', 'save', 'retire', 'updateAccount']) await assert.rejects(f.run(name, {}), /not authorized/);
  }
});
test('imports skip duplicates including same-batch duplicates, and validate all records before writing', async () => {
  const f = fixture();
  const result = await f.run('addAccounts', { startMonth: '2026-09', accounts: [account, { ...account, bank: ' example BANK ' }] });
  assert.equal(result.added, 1); assert.equal(result.skipped, 1);
  await assert.rejects(f.run('addAccounts', { startMonth: '2026-09', accounts: [{ ...account, bank: 'Other' }, { ...account, dueDay: 32 }] }), /Due day/);
  assert.equal(f.tables.paymentAccounts.length, 1);
  await assert.rejects(f.run('addAccounts', { startMonth: '2026-13', accounts: [account] }), /valid month/);
});
test('approved logins share accounts and versioned history across different identities', async () => {
  const f = await seeded();
  await f.run('save', { accountId: f.id, month: '2026-09', status: 'scheduled', expectedVersion: 0, note: 'Keep this history' });
  f.ctx.auth.getUserIdentity = async () => ({ tokenIdentifier: 'issuer|work', email: 'work@example.com', emailVerified: true });
  const result = await f.run('dashboard', { month: '2026-09' });
  assert.equal(result.accounts[0]._id, f.id);
  assert.equal(result.logs[0].note, 'Keep this history');
  await assert.rejects(f.run('save', { accountId: f.id, month: '2026-09', status: 'paid', expectedVersion: 0 }), /another device/);
  await f.run('save', { accountId: f.id, month: '2026-09', status: 'paid', expectedVersion: 1 });
  await f.run('updateAccount', { accountId: f.id, ...account, dueDay: 5 });
  f.ctx.auth.getUserIdentity = async () => ({ tokenIdentifier: 'issuer|owner', email: 'owner@example.com', emailVerified: true });
  const updated = await f.run('dashboard', { month: '2026-09' });
  assert.equal(updated.logs[0].status, 'paid');
  assert.equal(updated.logs[0].version, 2);
  assert.equal(updated.accounts[0].dueDay, 5);
  await f.run('retire', { accountId: f.id, endMonth: '2026-09' });
  assert.equal(f.tables.paymentAccounts[0].endMonth, '2026-09');
});
test('missing workspace or allowlist configuration fails closed', async () => {
  for (const key of Object.keys(env)) {
    const previous = env[key];
    try { env[key] = ''; await assert.rejects(fixture().run('verify'), /not authorized/); }
    finally { env[key] = previous; }
  }
});
test('approved logins cannot access documents outside the configured workspace', async () => {
  const f = await seeded();
  f.tables.paymentAccounts[0].owner = 'issuer|unrelated';
  const result = await f.run('dashboard', { month: '2026-09' }); assert.equal(result.accounts.length, 0); assert.equal(result.logs.length, 0);
  await assert.rejects(f.run('save', { accountId: f.id, month: '2026-09', status: 'paid', expectedVersion: 0 }), /Account not found/);
  await assert.rejects(f.run('retire', { accountId: f.id, endMonth: '2026-09' }), /Account not found/);
  await assert.rejects(f.run('updateAccount', { accountId: f.id, ...account }), /Account not found/);
});
test('month history, zero amounts, clearing amounts, and status-only updates preserve the intended data', async () => {
  const f = await seeded();
  await f.run('save', { accountId: f.id, month: '2026-09', status: 'scheduled', expectedVersion: 0, amountCents: 0, note: 'Scheduled for the first' });
  await f.run('save', { accountId: f.id, month: '2026-09', status: 'paid', expectedVersion: 1 });
  let result = await f.run('dashboard', { month: '2026-09' });
  assert.equal(result.logs[0].amountCents, 0); assert.equal(result.logs[0].note, 'Scheduled for the first'); assert.equal(result.logs[0].status, 'paid');
  assert.equal((await f.run('dashboard', { month: '2026-10' })).logs.length, 0);
  await f.run('save', { accountId: f.id, month: '2026-10', status: 'nothing_due', expectedVersion: 0 });
  await f.run('save', { accountId: f.id, month: '2026-09', status: 'unchecked', expectedVersion: 2, amountCents: null, note: '' });
  result = await f.run('dashboard', { month: '2026-09' }); assert.equal(result.logs[0].amountCents, undefined); assert.equal(result.logs[0].note, '');
  assert.equal((await f.run('dashboard', { month: '2026-10' })).logs[0].status, 'nothing_due');
});
test('stale writes, fractional cents, invalid months and inactive months do not update a record', async () => {
  const f = await seeded(); const args = { accountId: f.id, month: '2026-09', status: 'paid', expectedVersion: 0 };
  for (const amountCents of [-1, 0.1, Infinity, 10000000001]) await assert.rejects(f.run('save', { ...args, amountCents }), /valid amount/);
  await assert.rejects(f.run('save', { ...args, month: '2026-08' }), /not active/);
  await assert.rejects(f.run('save', { ...args, month: '2026-00' }), /valid month/);
  await f.run('save', args);
  await assert.rejects(f.run('save', { ...args, status: 'unchecked' }), /another device/);
  assert.equal(f.tables.paymentLogs[0].status, 'paid'); assert.equal(f.tables.paymentLogs[0].version, 1);
});
test('retirement preserves history, prevents future writes, and can be reversed', async () => {
  const f = await seeded();
  await f.run('save', { accountId: f.id, month: '2026-10', status: 'paid', expectedVersion: 0 });
  await assert.rejects(f.run('retire', { accountId: f.id, endMonth: '2026-09' }), /later history/);
  await f.run('retire', { accountId: f.id, endMonth: '2026-10' });
  await assert.rejects(f.run('save', { accountId: f.id, month: '2026-11', status: 'paid', expectedVersion: 0 }), /not active/);
  assert.equal((await f.run('dashboard', { month: '2026-10' })).logs[0].status, 'paid');
  await f.run('retire', { accountId: f.id, endMonth: null });
  await f.run('save', { accountId: f.id, month: '2026-11', status: 'paid', expectedVersion: 0 });
  assert.equal(f.tables.paymentLogs.length, 2);
});
test('editing due day and names retains history and rejects duplicate account names', async () => {
  const f = await seeded();
  await f.run('save', { accountId: f.id, month: '2026-09', status: 'paid', expectedVersion: 0 });
  await f.run('updateAccount', { ...account, accountId: f.id, dueDay: 15 }); assert.equal(f.tables.paymentAccounts[0].dueDay, 15);
  assert.equal(f.tables.paymentLogs[0].status, 'paid');
  await f.run('addAccounts', { startMonth: '2026-09', accounts: [{ ...account, nickname: 'Second card' }] });
  await assert.rejects(f.run('updateAccount', { ...account, accountId: f.id, nickname: 'second CARD' }), /already exists/);
});
