const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFile(path.join(root, 'tools/access/app.js'), 'utf8');
const synthetic = {
  viewer: { email: 'owner@example.com' }, loadedAt: Date.UTC(2026, 9, 9, 1), policyReviewedAt: '2026-10-08',
  tools: [
    { id: 'payments', name: 'Payments', href: '/tools/payments/', scope: 'allowlist', audience: ['owner@example.com', 'friend@example.com'], evidence: 'Live configuration', source: 'CARD_PAYMENTS_ALLOWED_EMAIL', read: 'Shared checklist and screenshots', edit: 'Monthly statuses and notes', manage: 'Retire accounts', boundary: 'Approved accounts share this workspace.' },
    { id: 'rally', name: 'Rally', href: '/tools/rally/', scope: 'membership', audience: ['Members of each event'], evidence: 'Reviewed policy', source: 'rally:memberFor', read: 'Shared event plans', edit: 'Shared tasks and travel', manage: 'Admins invite and remove crew', boundary: 'Membership applies to the event.', attention: true },
    { id: 'statement-links', name: 'Shared statement reviews', href: '/tools/payments/statements/', scope: 'share', audience: ['Anyone holding an enabled secret link'], evidence: 'Reviewed policy', source: 'statements:access', read: 'Original PDF', edit: 'Allocations and notes', manage: 'Owner disables links', boundary: 'Forwarding grants read and edit access.', linkCount: 2 },
    { id: 'public', name: '<img src=x onerror=window.injected=true>', href: 'javascript:alert(1)', scope: 'public', audience: ['Anyone with the URL'], evidence: 'Reviewed policy', source: 'Static hosting', read: 'Public pages', edit: 'None', manage: 'Owner publishes', boundary: 'Public assets can be fetched directly.' },
  ],
  findings: [{ id: 'board-bypass', severity: 'high', title: 'An older board API bypasses private reads', detail: 'A signed-out read returned data in the dated audit. Live writes untested.', next: 'Protect every route.', evidence: 'Live read check · October 8, 2026', affects: ['rally'] }],
  limitations: 'Policy descriptions are a dated review, not an automatic security scan.',
};
async function open(browser, { signedIn = true, denied = false, pending, viewport = { width: 1440, height: 1000 }, failure = false } = {}) {
  const page = await browser.newPage({ viewport }); const errors = []; const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ signedIn }) => {
    const token = 'test.' + btoa(JSON.stringify({ aud: 'convex' })) + '.test';
    window.__internal_ClerkUICtor = {};
    const session = { id: 'synthetic-owner', getToken: async () => token };
    window.Clerk = { session: signedIn ? session : null, load: async () => {}, addListener(fn) { window.changeAccessSession = fn; },
      mountSignIn(mount) { mount.innerHTML = '<div class="cl-cardBox"><div class="cl-card"><h2 class="cl-headerTitle">Sign in</h2><label>Email<input type="email"></label><button>Continue</button></div></div>'; },
      unmountSignIn(mount) { mount.replaceChildren(); },
      async signOut() { this.session = null; window.changeAccessSession({ session: null }); },
    };
  }, { signedIn });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'clerk.john-ta.com') return route.fulfill({ body: '', contentType: 'text/javascript' });
    if (url.hostname === 'rapid-shark-565.convex.cloud') {
      requests.push({ body: request.postDataJSON(), headers: request.headers() });
      if (pending) await pending;
      if (failure) return route.abort();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(denied ? { status: 'error', errorMessage: 'This account is not authorized to view site access.' } : { status: 'success', value: synthetic }) });
    }
    if (url.hostname !== 'www.john-ta.com') return route.abort();
    const file = path.join(root, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
    try { return route.fulfill({ body: await fs.readFile(file), contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : undefined }); }
    catch { return route.abort(); }
  });
  await page.goto('https://www.john-ta.com/tools/access/');
  return { page, errors, requests };
}

test('signed-out and denied visitors never receive a rendered inventory; no preview bypass exists', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const out = await open(browser, { signedIn: false });
    await out.page.locator('#sign-in input').waitFor(); assert.equal(out.requests.length, 0); assert.equal(await out.page.locator('#tools').textContent(), '');
    await out.page.goto('https://www.john-ta.com/tools/access/?preview=1'); await out.page.locator('#sign-in input').waitFor(); assert.equal(out.requests.length, 0);
    await out.page.close();
    const denied = await open(browser, { denied: true });
    await denied.page.getByText(/available only to the site owner/).waitFor();
    assert.equal(await denied.page.locator('#overview').isVisible(), false); assert.equal(await denied.page.locator('#tools').textContent(), '');
    assert.equal(await denied.page.locator('#retry-auth').isVisible(), false); assert.deepEqual(denied.errors, []); await denied.page.close();
  } finally { await browser.close(); }
});

test('owner can search, filter, expand with the keyboard, and sees escaped policy text', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors, requests } = await open(browser); await page.locator('#overview').waitFor();
    assert.equal(requests[0].body.path, 'accessOverview:overview'); assert.match(requests[0].headers.authorization, /^Bearer test/);
    assert.equal(await page.locator('#tools details').count(), 4); assert.equal(await page.locator('#tools img').count(), 0);
    assert.equal(await page.locator('#tool-public a').count(), 0);
    await page.locator('#search').fill('friend@example.com'); assert.equal(await page.locator('#tools details').count(), 1);
    await page.locator('#tool-payments summary').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#tool-payments').getAttribute('open'), '');
    await page.locator('#search').fill(''); await page.getByRole('button', { name: 'Other access', exact: true }).click(); assert.equal(await page.locator('#tools details').count(), 2);
    await page.getByRole('button', { name: 'Needs review', exact: true }).click(); assert.equal(await page.locator('#tools details').count(), 1);
    await page.locator('#search').fill('no-such-account'); assert.equal(await page.locator('#empty').isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(errors, []); await page.close();
  } finally { await browser.close(); }
});

test('account changes clear all private content; delayed owner responses cannot restore it', async () => {
  const browser = await chromium.launch({ headless: true }); let release;
  const pending = new Promise(resolve => { release = resolve; });
  try {
    const first = await open(browser); await first.page.locator('#overview').waitFor();
    await first.page.evaluate(() => window.changeAccessSession({ session: null }));
    assert.equal(await first.page.locator('#tools').textContent(), ''); assert.equal(await first.page.locator('#findings').textContent(), '');
    assert.equal(await first.page.locator('#limitations').textContent(), ''); assert.equal(await first.page.locator('#overview').isVisible(), false); await first.page.close();
    const slow = await open(browser, { pending });
    await slow.page.waitForFunction(() => typeof window.changeAccessSession === 'function');
    await slow.page.evaluate(() => window.changeAccessSession({ session: null })); release();
    await slow.page.locator('#sign-in input').waitFor();
    assert.equal(await slow.page.locator('#tools').textContent(), ''); assert.equal(await slow.page.locator('#overview').isVisible(), false); assert.deepEqual(slow.errors, []); await slow.page.close();
  } finally { release(); await browser.close(); }
});

test('network failures do not appear as denials and keep the inventory hidden', async () => {
  const browser = await chromium.launch({ headless: true });
  try { const { page } = await open(browser, { failure: true }); await page.getByText(/Couldn’t load the access overview/).waitFor(); assert.equal(await page.locator('#retry-auth').isVisible(), true); assert.equal(await page.locator('#overview').isVisible(), false); await page.close(); }
  finally { await browser.close(); }
});

test('the inventory and expanded permissions fit desktop, phone, and narrow phone layouts', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const { page, errors } = await open(browser, { viewport }); await page.locator('#overview').waitFor();
      await page.locator('#tool-payments summary').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${viewport.width}px`);
      const clipped = await page.locator('#overview button, #overview input, #tools summary, #tools dd, #tools .audience').evaluateAll(nodes => nodes.filter(node => { const box = node.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1); }).length);
      assert.equal(clipped, 0); assert.deepEqual(errors, []);
      if (viewport.width === 1440 || viewport.width === 390) await page.screenshot({ path: `/private/tmp/site-access-${viewport.width}.png`, fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});

test('public assets contain no inventory, account list, or local private-data caching', async () => {
  const script = await source, html = await fs.readFile(path.join(root, 'tools/access/index.html'), 'utf8');
  const backend = await fs.readFile(path.join(root, 'convex/accessOverview.ts'), 'utf8');
  assert.doesNotMatch(script + html, /johnta2018@gmail\.com|vivek@affil\.ai|CARD_PAYMENTS_ALLOWED_EMAIL|warRoom:get|board-bypass|localStorage|sessionStorage/);
  assert.doesNotMatch(backend, /warRoom:get|rally:memberFor|vivek@affil\.ai|board-bypass/);
  assert.doesNotMatch(html, /analytics\.js/);
});

test('the signed-out gate is centered and fits a narrow phone without missing assets', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }]) {
      const { page, errors } = await open(browser, { signedIn: false, viewport });
      await page.locator('#sign-in input').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const box = await page.locator('#gate').boundingBox();
      assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2);
      assert.ok(box.width <= Math.min(480, viewport.width - 32));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
