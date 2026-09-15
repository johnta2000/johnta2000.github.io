import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function page({ ui = true, signedIn = false, invalid = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, hidden: true, replaceChildren() {} });
    return elements.get(id);
  };
  const calls = [];
  const ClerkUI = function () {};
  let ready;
  const context = vm.createContext({
    URLSearchParams, atob, decodeURIComponent, escape,
    location: { search: invalid ? '' : '?code=' + 'x'.repeat(72), href: 'https://www.john-ta.com/tools/tranquil-connect/?code=' + 'x'.repeat(72) },
    document: { getElementById: element },
    window: {
      __internal_ClerkUICtor: ui ? ClerkUI : undefined,
      addEventListener: (_, fn) => { ready = fn; },
      Clerk: {
        user: signedIn ? {} : null,
        session: { getToken: async () => 'test.' + btoa(JSON.stringify({ aud: 'convex' })) + '.test' },
        load: async options => { assert.equal(options.ui.ClerkUI, ClerkUI); calls.push('load'); },
        mountSignIn: () => calls.push('mount'), addListener() {},
      },
    },
    fetch: async () => ({ ok: true, json: async () => ({ status: 'success', value: { connected: true } }) }),
  });
  vm.runInContext(source, context);
  return { run: () => ready(), element, calls };
}
test('Clerk v6 receives its UI constructor before mounting sign-in', async () => {
  const p = page(); await p.run(); assert.deepEqual(p.calls, ['load', 'mount']);
});
test('missing UI bundle gives a useful error instead of a blank login', async () => {
  const p = page({ ui: false }); await p.run(); assert.match(p.element('status').textContent, /components could not load/);
});
test('invalid links do not start authentication', async () => {
  const p = page({ invalid: true }); await p.run(); assert.equal(p.calls.length, 0);
});
test('successful connection explains returning to iPhone and desktop', async () => {
  const p = page({ signedIn: true }); await p.run(); assert.equal(p.element('result').hidden, false);
  assert.match(p.element('result-copy').textContent, /tap Done/);
});
