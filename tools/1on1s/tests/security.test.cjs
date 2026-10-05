const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { createHash, webcrypto } = require('node:crypto');
globalThis.crypto ??= webcrypto;
function load(file) {
  const source = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const m = { exports: {} }; new Function('require', 'module', 'exports', source)(require, m, m.exports); return m.exports;
}
const journal = load('convex/monthlyJournal.ts');
const recap = load('convex/monthlyJournalRecap.ts');
const passwords = load('convex/monthlyJournalPassword.ts');
const { getFunctionName } = require('convex/server');
function fixture() {
  let id = 0; const tables = {};
  const ctx = { identity: { email: 'johnta2018@gmail.com', emailVerified: true, tokenIdentifier: 'owner' } };
  ctx.auth = { getUserIdentity: async () => ctx.identity };
  ctx.db = {
    query(table) {
      let filters = [], descending = false;
      const q = { eq(k,v) { filters.push(x => x[k] === v); return q; }, lt(k,v) { filters.push(x => x[k] < v); return q; }, gte(k,v) { filters.push(x => x[k] >= v); return q; } };
      const rows = () => (tables[table] || []).filter(x => filters.every(f => f(x))).sort((a,b) => (a.month || a.standupDate || '').localeCompare(b.month || b.standupDate || '') * (descending ? -1 : 1));
      const chain = { withIndex(_, fn) { fn(q); return chain; }, order() { descending = true; return chain; }, take: async n => rows().slice(0,n), unique: async () => rows()[0] || null, first: async () => rows()[0] || null };
      return chain;
    },
    async insert(table, data) { const row = { ...data, _id: String(++id) }; (tables[table] ||= []).push(row); return row._id; },
    async patch(key, data) { Object.assign(Object.values(tables).flat().find(x => x._id === key), data); },
    async delete(key) { for (const t in tables) tables[t] = tables[t].filter(x => x._id !== key); },
  };
  ctx.runMutation = (ref, args) => journal[getFunctionName(ref).split(':')[1]]._handler(ctx, args);
  return { ctx, tables };
}
const entry = token => ({ token, month: '2026-10', answers: ['a', '', '', '', ''], notes: 'private', followups: 'next', revision: 0 });
const unlock = (ctx, password = 'my private password', setup = false) => passwords.unlock._handler(ctx, { password, setup });
test('all public data endpoints reject unauthenticated, wrong and unverified emails', async () => {
  const {ctx} = fixture();
  for (const identity of [null, {email:'other@gmail.com',emailVerified:true}, {email:'johnta2018@gmail.com',emailVerified:false}, {email:'johnta2018@gmail.com'}]) {
    ctx.identity = identity;
    for (const [fn,args] of [[recap.read,{token:"x",month:"2026-10",person:"vish"}],[journal.assign,{token:"x",month:"2026-10",target:"vish",revision:0}],[journal.status,{}],[journal.read,{token:'x',month:'2026-10'}],[journal.save,entry('x')],[journal.lock,{token:'x'}],[passwords.unlock,{password:'long password here',setup:true}]]) await assert.rejects(fn._handler(ctx,args), /verified owner/);
  }
});
test('password setup, hashing, session enforcement, expiry and lock', async () => {
  const {ctx,tables} = fixture();
  await assert.rejects(journal.read._handler(ctx,{token:'x',month:'2026-10'}), /locked/);
  const session = await unlock(ctx, undefined, true);
  assert.notEqual(tables.monthlyJournalSecurity[0].hash, 'my private password');
  assert.equal(tables.monthlyJournalSessions[0].tokenHash, createHash('sha256').update(session.token).digest('hex'));
  await assert.rejects(unlock(ctx, 'wrong password here'), /Incorrect/);
  await assert.rejects(unlock(ctx, undefined, true), /already configured/);
  await journal.save._handler(ctx,entry(session.token));
  assert.equal((await journal.read._handler(ctx,{token:session.token,month:'2026-11'})).previous.notes, 'private');
  ctx.identity.tokenIdentifier = 'different-subject';
  await assert.rejects(journal.read._handler(ctx,{token:session.token,month:'2026-10'}), /locked/);
  await assert.rejects(unlock(ctx, undefined, true), /already configured/);
  ctx.identity.tokenIdentifier = 'owner';
  tables.monthlyJournalSessions[0].expiresAt = 0;
  await assert.rejects(journal.save._handler(ctx,entry(session.token)), /locked/);
  const fresh = await unlock(ctx);
  await journal.lock._handler(ctx,{token:fresh.token});
  await assert.rejects(journal.read._handler(ctx,{token:fresh.token,month:'2026-10'}), /locked/);
});
test('failed passwords are limited to five attempts per fifteen minutes', async () => {
  const {ctx,tables} = fixture(); await unlock(ctx, undefined, true);
  for (let i=0;i<5;i++) await assert.rejects(unlock(ctx,'incorrect password'), /Incorrect/);
  await assert.rejects(unlock(ctx), /Too many/);
  tables.monthlyJournalSecurity[0].windowStart = Date.now() - 900001;
  assert.ok((await unlock(ctx)).token);
});
test('saving rejects stale revisions, invalid months and oversized notes', async () => {
  const {ctx} = fixture(); const {token} = await unlock(ctx,undefined,true);
  assert.equal(await journal.save._handler(ctx,entry(token)),1);
  await assert.rejects(journal.save._handler(ctx,entry(token)), /another tab/);
  await assert.rejects(journal.save._handler(ctx,{...entry(token),month:'2026-13'}), /Invalid/);
  await assert.rejects(journal.save._handler(ctx,{...entry(token),notes:'x'.repeat(50001)}), /50,000/);
  assert.equal(await journal.save._handler(ctx,{...entry(token),revision:1}),2);
});

test('only the verified production issuer may omit email verification', async () => {
  const {ctx} = fixture();
  ctx.identity = { email:'johnta2018@gmail.com', issuer:'https://clerk.john-ta.com', tokenIdentifier:'owner' };
  assert.deepEqual(await journal.status._handler(ctx,{}),{configured:false});
  ctx.identity.emailVerified = false;
  await assert.rejects(journal.status._handler(ctx,{}), /verified owner/);
  delete ctx.identity.emailVerified; ctx.identity.issuer = 'https://other.example';
  await assert.rejects(journal.status._handler(ctx,{}), /verified owner/);
});

test('a one-character password can be set and used to unlock', async () => {
  const {ctx} = fixture();
  const initial = await unlock(ctx, 'x', true);
  await journal.lock._handler(ctx,{token:initial.token});
  assert.ok((await unlock(ctx, 'x')).token);
});

test('person histories remain isolated and unassigned notes move without overwriting', async () => {
  const {ctx} = fixture(); const {token} = await unlock(ctx,'x',true);
  await journal.save._handler(ctx,entry(token));
  await journal.save._handler(ctx,{...entry(token),person:'jenny',notes:'Jenny only'});
  const november = {token,month:'2026-11',person:'jenny'};
  assert.equal((await journal.read._handler(ctx,november)).previous.notes,'Jenny only');
  assert.equal((await journal.read._handler(ctx,{...november,person:'vivek'})).previous,null);
  await assert.rejects(journal.assign._handler(ctx,{token,month:'2026-10',target:'jenny',revision:1}), /already has an entry/);
  await assert.rejects(journal.assign._handler(ctx,{token,month:'2026-10',target:'vish',revision:0}), /changed/);
  await journal.assign._handler(ctx,{token,month:'2026-10',target:'vish',revision:1});
  assert.equal((await journal.read._handler(ctx,{token,month:'2026-10'})).current,null);
  assert.equal((await journal.read._handler(ctx,{token,month:'2026-10',person:'vish'})).current.notes,'private');
  assert.equal((await journal.read._handler(ctx,{...november,person:'vish'})).previous.notes,'private');
});

test('monthly recap reads only selected person and month, deduplicates lines, and never writes', async () => {
  const {ctx,tables} = fixture(); const {token} = await unlock(ctx,'x',true);
  const source = {teamId:'johns-website-default',personKey:'vishal',personName:'Vishal',standupDate:'2026-10-01',yesterday:'<ul><li>Shipped &amp; tested launch</li></ul>',today:'<p>Plan a launch</p>',blockers:'Waiting for review'};
  await ctx.db.insert('standupEntries',source);
  await ctx.db.insert('standupEntries',{...source,personKey:'vish',standupDate:'2026-10-02'});
  await ctx.db.insert('standupEntries',{...source,personKey:'john',yesterday:'John private context'});
  await ctx.db.insert('standupEntries',{...source,personKey:'jenny',yesterday:'Jenny context'});
  await ctx.db.insert('standupEntries',{...source,standupDate:'2026-09-30'});
  await ctx.db.insert('standupEntries',{...source,teamId:'other-team'});
  const before=JSON.stringify(tables);
  const result=await recap.read._handler(ctx,{token,month:'2026-10',person:'vish'});
  assert.equal(result.updateCount,2); assert.equal(result.work.length,1);
  assert.equal(result.work[0].text,'Shipped & tested launch'); assert.equal(result.work[0].sourceIds.length,2);
  assert.equal(result.plans[0].text,'Plan a launch');
  assert.equal(JSON.stringify(tables),before);
  await assert.rejects(recap.read._handler(ctx,{token:'bad',month:'2026-10',person:'vish'}),/locked/);
  assert.equal((await recap.read._handler(ctx,{token,month:'2026-10',person:'vivek'})).updateCount,0);
});
