const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../auth.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

function fixture({ signedIn = false, denied = false, failure = false, deferredRead, deferredSave } = {}) {
  const elements = new Map(), requests = [], events = {};
  const el = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } });
    return elements.get(id);
  };
  const token = 'test.' + Buffer.from(JSON.stringify({ aud: 'convex' })).toString('base64') + '.test';
  const session = { id: 'owner-session', getToken: async () => token };
  let listener, opened = null, locks = 0, mounts = 0, currentVersion = 0;
  const clerk = {
    session: signedIn ? session : null,
    load: async () => {}, mountSignIn() { mounts++; }, unmountSignIn() {}, addListener(callback) { listener = callback; },
    async signOut() { this.session = null; await listener({ session: null }); },
  };
  const window = {
    Clerk: clerk, __internal_ClerkUICtor: {}, confirm: () => true,
    PackingApp: { lock() { locks++; opened = null; }, open(value) { opened = value; } },
    addEventListener(name, callback) { events[name] = callback; },
  };
  const context = {
    window, document: { getElementById: el, querySelectorAll: () => [] },
    location: { origin: 'https://www.john-ta.com', pathname: '/tools/packing/', reload() {} },
    setTimeout, clearTimeout, AbortSignal, atob,
    fetch: async (_, options) => {
      const request = JSON.parse(options.body); requests.push(request);
      if (request.path === 'packing:read' && deferredRead) await deferredRead;
      if (request.path === 'packing:save' && deferredSave) await deferredSave;
      if (request.path === 'packing:save' && failure) throw Error('offline');
      if (denied) return { ok: true, json: async () => ({ status: 'error', errorMessage: 'This account is not authorized for packing.' }) };
      const value = request.path === 'packing:read' ? { state: null, version: currentVersion } : { version: ++currentVersion };
      return { ok: true, json: async () => ({ status: 'success', value }) };
    },
  };
  vm.runInNewContext(source, context);
  return { el, requests, events, clerk, session, get opened() { return opened; }, get locks() { return locks; }, get mounts() { return mounts; }, change: value => listener(value), recover: () => { failure = false; } };
}

test('signed-out and unapproved accounts cannot open Packing or issue saves', async () => {
  const signedOut = fixture(); await settle();
  assert.equal(signedOut.opened, null); assert.equal(signedOut.el('app').hidden, true);
  assert.equal(signedOut.mounts, 1); assert.equal(signedOut.requests.length, 0);
  const denied = fixture({ signedIn: true, denied: true }); await settle();
  assert.equal(denied.opened, null); assert.equal(denied.el('app').hidden, true);
  assert.match(denied.el('gate-message').textContent, /Only John Ta/);
  assert.deepEqual(denied.requests.map(request => request.path), ['packing:read']);
});

test('the approved account opens saved data and queued saves use successive server versions', async () => {
  const app = fixture({ signedIn: true }); await settle();
  assert.equal(app.el('app').hidden, false); assert.equal(app.el('add-trip').hidden, false);
  app.opened.saveState({ name: 'First edit' }); app.opened.saveState({ name: 'Latest edit' }); await settle();
  const saves = app.requests.filter(request => request.path === 'packing:save');
  assert.equal(saves.length, 2);
  assert.deepEqual(saves.map(request => request.args.expectedVersion), [0, 1]);
  assert.equal(saves[1].args.state.name, 'Latest edit');
  assert.match(app.el('save-status').textContent, /All changes saved/);
});

test('failed writes remain unsaved and can be retried without losing the latest edit', async () => {
  const app = fixture({ signedIn: true, failure: true }); await settle();
  app.opened.saveState({ name: 'Keep this draft' }); await settle();
  assert.equal(app.el('storage-error').hidden, false); assert.equal(app.el('save-actions').hidden, false);
  assert.match(app.el('save-status').textContent, /not been saved/);
  app.recover(); app.el('retry-save').listeners.click(); await settle();
  assert.equal(app.el('save-actions').hidden, true);
  assert.match(app.el('save-status').textContent, /All changes saved/);
  assert.equal(app.requests.at(-1).args.state.name, 'Keep this draft');
});

test('signing out clears the checklist and a delayed read cannot reveal it again', async () => {
  let release;
  const deferredRead = new Promise(resolve => { release = resolve; });
  const app = fixture({ signedIn: true, deferredRead }); await settle();
  app.change({ session: null }); release(); await settle();
  assert.equal(app.opened, null); assert.equal(app.el('app').hidden, true);
  assert.ok(app.locks >= 2);
});

test('a late save acknowledgement cannot restore private content after sign-out', async () => {
  let release;
  const deferredSave = new Promise(resolve => { release = resolve; });
  const app = fixture({ signedIn: true, deferredSave }); await settle();
  app.opened.saveState({ name: 'Private draft' }); await settle();
  app.change({ session: null }); release(); await settle();
  assert.equal(app.opened, null); assert.equal(app.el('app').hidden, true);
  assert.equal(app.el('save-status').textContent, '');
});
