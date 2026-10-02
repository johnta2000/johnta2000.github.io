const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');

function setup({ signedIn = false, responses = {}, loadError = false, pending } = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: ['directory', 'empty', 'account', 'retry'].includes(id), textContent: '', children: [], listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
    });
    return elements.get(id);
  }
  const token = 'test.' + btoa(JSON.stringify({ aud: 'convex' })) + '.test';
  const session = { id: 'session-one', getToken: async () => token };
  const user = { primaryEmailAddress: { emailAddress: 'member@example.com' } };
  const requests = [];
  let listener, options, mounts = 0;
  const clerk = {
    session: signedIn ? session : null, user: signedIn ? user : null,
    load: async () => { if (loadError) throw Error('offline'); },
    mountSignIn: (_, config) => { options = config; mounts++; },
    unmountSignIn() {}, addListener(fn) { listener = fn; },
    async signOut() { this.session = null; this.user = null; listener({ session: null, user: null }); },
  };
  const context = vm.createContext({
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => element('node-' + elements.size) },
    window: { Clerk: clerk, __internal_ClerkUICtor: {}, addEventListener() {} },
    location: { origin: 'https://www.john-ta.com', pathname: '/login/', reload() {}, replace() {} },
    setTimeout, clearTimeout, AbortSignal, atob, encodeURIComponent,
    fetch: async (url, opts) => {
      const { path } = JSON.parse(opts.body);
      requests.push({ url, path, token: opts.headers.Authorization });
      if (pending) await pending;
      const response = responses[path];
      if (response instanceof Error) throw response;
      return { ok: true, json: async () => response ?? { status: 'error', errorMessage: 'This email is not authorized.' } };
    },
  });
  vm.runInContext(source, context);
  return { element, requests, clerk, session, user, get mounts() { return mounts; }, get options() { return options; }, change: value => listener(value) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const success = value => ({ status: 'success', value });

test('signed-out visitors see login, no directory, and make no access requests', async () => {
  const p = setup(); await settle();
  assert.equal(p.mounts, 1);
  assert.equal(p.element('directory').hidden, true);
  assert.equal(p.requests.length, 0);
  assert.equal(p.options.forceRedirectUrl, 'https://www.john-ta.com/login/');
  assert.equal(p.options.routing, 'hash');
});
test('only server-authorized apps appear, with an accessible Rally event', async () => {
  const p = setup({ signedIn: true, responses: {
    'rally:listEvents': success([{ id: 'my-room & friends' }]),
    'standups:verify': success({ email: 'member@example.com' }),
  } }); await settle();
  const links = p.element('apps').children.map(item => item.children[0]);
  assert.deepEqual(links.map(link => link.textContent), ['Rally', 'Standups']);
  assert.equal(links[0].href, '../tools/rally/?event=my-room%20%26%20friends');
  assert.equal(p.element('directory').hidden, false);
  assert.equal(p.mounts, 0);
  assert.equal(p.requests.length, 6);
  assert.ok(p.requests.every(req => req.token.startsWith('Bearer test.')));
  assert.ok(p.requests.find(req => req.path === 'rally:listEvents').url.includes('dashing-heron-837'));
  assert.ok(p.requests.find(req => req.path === 'standups:verify').url.includes('rapid-shark-565'));
});
test('a new account does not gain access to private apps', async () => {
  const p = setup({ signedIn: true, responses: { 'rally:listEvents': success([]) } }); await settle();
  assert.equal(p.element('apps').children.length, 0);
  assert.equal(p.element('empty').hidden, false);
  assert.equal(p.element('retry').hidden, true);
});
test('network failures do not appear as access denials; other apps still load', async () => {
  const p = setup({ signedIn: true, responses: {
    'rally:listEvents': Error('offline'), 'sleep:verify': success({ email: 'member@example.com' }),
  } }); await settle();
  assert.equal(p.element('retry').hidden, false);
  assert.match(p.element('status').textContent, /could not be checked/);
  assert.equal(p.element('empty').hidden, true);
  assert.equal(p.element('apps').children[0].children[0].textContent, 'Sleep');
});
test('sign-out clears app links and prevents late responses from restoring them', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const p = setup({ signedIn: true, pending, responses: { 'rally:listEvents': success([{ id: 'private' }]) } });
  await settle();
  p.change({ session: null, user: null });
  release(); await settle();
  assert.equal(p.element('directory').hidden, true);
  assert.equal(p.element('apps').children.length, 0);
  assert.equal(p.element('email').textContent, '');
  assert.equal(p.mounts, 1);
});
test('signing in updates the directory without a reload; session refreshes do not remount', async () => {
  const p = setup({ responses: { 'monitoring:verify': success({ email: 'member@example.com' }) } }); await settle();
  p.change({ session: p.session, user: p.user }); await settle();
  assert.equal(p.element('apps').children[0].children[0].textContent, 'Monitoring');
  p.change({ session: p.session, user: p.user }); await settle();
  assert.equal(p.requests.length, 6);
});
test('an unavailable identity provider fails closed with a retry', async () => {
  const p = setup({ loadError: true }); await settle();
  assert.equal(p.element('directory').hidden, true);
  assert.equal(p.element('retry').hidden, false);
  assert.match(p.element('status').textContent, /Sign-in couldn’t load/);
  assert.equal(p.requests.length, 0);
});

test('card payments appears only after its own server authorization succeeds', async () => {
  const p = setup({ signedIn: true, responses: { 'cardPayments:verify': success({ email: 'member@example.com' }) } }); await settle();
  assert.equal(p.element('apps').children.length, 1);
  const link = p.element('apps').children[0].children[0];
  assert.equal(link.textContent, 'Card payments');
  assert.equal(link.href, '../tools/payments/');
});
