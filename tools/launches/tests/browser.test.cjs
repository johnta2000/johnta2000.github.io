const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
global.crypto ||= require('node:crypto').webcrypto;
const M = require('../model.js');
const root = path.resolve(__dirname, '../../..');
const members = [{ email: 'owner@example.com', name: 'Owner' }, { email: 'jenny@example.com', name: 'Jenny' }, { email: 'andrew@example.com', name: 'Andrew' }];
function initial() {
  const channels = [
    ['chase', 'Synthetic Chase group', 'facebook', ['chase', 'csr']],
    ['outreach', 'Synthetic editorial contact', 'outreach', ['general', 'original research']],
    ['owned', 'Synthetic NextCard account', 'owned', ['general']],
    ['ihg', 'Synthetic IHG group', 'facebook', ['ihg']],
  ].map(([key, name, kind, tags]) => ({ key, value: { ...M.newChannel(), name, kind, tags, url: 'https://example.com/channel', fit: 'Useful information for this audience.' }, version: 1, createdAt: 1, updatedAt: 1, updatedBy: members[0].email }));
  return { email: members[0].email, members, channels, launches: [] };
}
async function open(browser, { signedIn = true, denied = false, pendingRead, failSaves = false, conflict = false, viewport = { width: 1440, height: 1000 }, workspace = initial() } = {}) {
  const page = await browser.newPage({ viewport }), errors = [], requests = [], store = structuredClone(workspace);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(({ signedIn }) => {
    const token = 'test.' + btoa(JSON.stringify({ aud: 'convex' })) + '.test', session = { id: 'synthetic-session', getToken: async () => token };
    window.__internal_ClerkUICtor = {};
    window.Clerk = { session: signedIn ? session : null, load: async () => {}, addListener(fn) { window.changeLaunchSession = fn; },
      mountSignIn(mount) { mount.innerHTML = '<div class="cl-cardBox"><div class="cl-card"><h2 class="cl-headerTitle">Sign in</h2><label>Email<input type="email"></label><button>Continue</button></div></div>'; },
      unmountSignIn(mount) { mount.replaceChildren(); }, async signOut() { this.session = null; window.changeLaunchSession({ session: null }); },
    };
  }, { signedIn });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'clerk.john-ta.com') return route.fulfill({ body: '', contentType: 'text/javascript' });
    if (url.hostname === 'rapid-shark-565.convex.cloud') {
      const payload = request.postDataJSON(); requests.push({ payload, headers: request.headers() });
      const result = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
      if (denied) return result({ status: 'error', errorMessage: 'This account is not authorized for NextCard launches.' });
      if (payload.path.endsWith(':initialize')) return result({ status: 'success', value: null });
      if (payload.path.endsWith(':workspace')) { if (pendingRead) await pendingRead; return result({ status: 'success', value: store }); }
      if (failSaves) return route.abort();
      const records = payload.path.endsWith(':saveChannel') ? store.channels : store.launches, args = payload.args;
      let record = records.find(item => item.key === args.key);
      if (conflict || (record?.version || 0) !== args.expectedVersion) return result({ status: 'error', errorMessage: 'This launch changed since you opened it. Review the latest version before saving.' });
      if (!record) { record = { key: args.key, version: 0, createdAt: Date.now() }; records.push(record); }
      record.value = args.value; record.updatedAt = Date.now(); record.version++;
      return result({ status: 'success', value: { version: record.version } });
    }
    if (url.hostname !== 'www.john-ta.com') return route.abort();
    const file = path.join(root, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
    try { return route.fulfill({ body: await fs.readFile(file), contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' }); } catch { return route.abort(); }
  });
  await page.goto('https://www.john-ta.com/tools/launches/');
  return { page, errors, requests, store, recover() { failSaves = false; conflict = false; } };
}
async function choose(page, label, value) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  const search = page.locator('.search-select-panel:not([hidden]) input'); await search.fill(value); await search.press('Enter');
}
async function changeMedium(page, scope, medium) {
  const button = page.locator(`[data-action="${scope}-medium"][data-medium="${medium}"]`);
  if (await button.isVisible()) await button.click();
  else await choose(page, 'Distribution medium', M.media[medium] || (medium === 'selected' ? 'Selected' : 'All media'));
}
async function save(page) { await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.locator('#editor').waitFor({ state: 'hidden' }); }

test('Channels is the starting view; medium changes and global searches keep selections until a launch is created', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, store, requests, errors } = await open(browser); await page.locator('#app').waitFor();
    assert.equal(await page.locator('[data-view="channels"]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.compact-channel').count(), 2);
    await page.locator('[data-library-channel="chase"]').check();
    await changeMedium(page, 'library', 'email');
    assert.equal(await page.locator('.compact-channel').count(), 1); await page.locator('[data-library-channel="outreach"]').check();
    await page.locator('[data-action="library-medium"][data-medium="facebook"]').click(); assert.equal(await page.locator('[data-library-channel="chase"]').isChecked(), true);
    await page.locator('#library-search').fill('editorial'); assert.equal(await page.locator('[data-library-channel="outreach"]').isChecked(), true);
    await page.locator('#library-search').fill(''); await page.locator('[data-action="library-medium"][data-medium="selected"]').click();
    assert.equal(await page.locator('.compact-channel').count(), 2); assert.equal(await page.locator('.medium-section').count(), 2);
    assert.equal(store.launches.length, 0); assert.ok(!requests.some(request => request.payload.path.endsWith(':saveLaunch')));
    await page.getByRole('button', { name: 'Create launch →', exact: true }).click(); await page.locator('#launch-name').fill('Selected destinations'); await save(page);
    await page.getByText('All changes saved', { exact: true }).waitFor();
    assert.deepEqual(store.launches[0].value.tasks.map(task => task.channelKey).sort(), ['chase', 'outreach']);
    assert.equal(await page.getByRole('tab', { name: /Channels/ }).getAttribute('aria-selected'), 'false');
    await page.getByRole('tab', { name: /Channels/ }).click(); await page.locator('[data-action="chooser-medium"][data-medium="email"]').click();
    assert.equal(await page.locator('[data-channel="outreach"]').isChecked(), true);
    await page.locator('[data-action="chooser-medium"][data-medium="facebook"]').click(); assert.equal(await page.locator('[data-channel="chase"]').isChecked(), true);
    assert.deepEqual(errors, []); await page.close();
  } finally { await browser.close(); }
});

test('the complete starting library uses compact medium views that fit desktop without a long channel list', async () => {
  const result = await require('esbuild').build({ entryPoints: [path.join(root, 'convex/nextcardLaunchSeed.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
  const module = { exports: {} }; require('node:vm').runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require });
  const workspace = initial(); workspace.channels = module.exports.launchChannelSeeds.map(record => ({ ...record, version: 1, createdAt: 1, updatedAt: 1 }));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const { page, errors } = await open(browser, { workspace, viewport: { width, height: width === 1440 ? 1000 : 844 } }); await page.locator('#app').waitFor();
      assert.equal(await page.locator('.compact-channel').count(), 9);
      if (width === 1440) { const box = await page.locator('#library-list').boundingBox(); assert.ok(box.y + box.height < 1000, 'All nine Facebook choices fit the desktop viewport'); }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/private/tmp/nextcard-channels-first-${width}.png`, fullPage: true });
      await changeMedium(page, 'library', 'reddit'); assert.equal(await page.locator('.compact-channel').count(), 6);
      assert.equal(await page.locator('[data-library-channel="seed-18"]').count(), 1, 'Owned r/nextcard is grouped under Reddit');
      await changeMedium(page, 'library', 'email'); assert.equal(await page.locator('.compact-channel').count(), 3);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});

test('a full launch can be created, assigned, planned, drafted, published, followed up, and duplicated', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const f = await open(browser), { page } = f; await page.locator('#app').waitFor();
    await page.locator('[data-library-channel="chase"]').check(); await page.getByRole('button', { name: 'Create launch →', exact: true }).click();
    await page.locator('#launch-name').fill('Synthetic CSR refresh'); await page.locator('#source-url').fill('https://example.com/source'); await page.locator('#summary').fill('A synthetic update for testing.'); await page.locator('#audience-tags').fill('chase, csr');
    await choose(page, 'Launch type', 'Tool update'); await choose(page, 'Launch owner', 'Jenny'); await save(page);
    await page.locator('[data-check]').first().check();
    await page.getByRole('tab', { name: /Channels/ }).click();
    await page.locator('#chooser-search').fill('Chase'); await page.locator('[data-channel="chase"]').check();
    await page.getByRole('button', { name: 'Prepare launch →' }).click(); await page.getByRole('button', { name: 'Work on distribution →' }).click(); await page.locator('[data-action="edit-task"]').click();
    await page.locator('#task-angle').fill('Explain the useful changes.'); await page.locator('#task-draft').fill('A native post with complete context.'); await choose(page, 'Task owner', 'Andrew'); await choose(page, 'Status', 'Awaiting approval'); await save(page);
    assert.equal(await page.getByText('Awaiting approval', { exact: true }).count(), 1); assert.match(await page.locator('.launch-meta').textContent(), /1 of 7/);
    await page.locator('[data-action="edit-task"]').click(); await choose(page, 'Status', 'Live'); await page.locator('#task-url').fill('https://example.com/live'); await page.locator('#task-outcome').fill('Members found the screenshot helpful.'); await save(page);
    assert.match(await page.locator('.launch-meta').textContent(), /2 of 7/);
    await page.getByRole('button', { name: 'Follow up →' }).click(); await page.locator('#launch-notes').fill('Bring a clear screenshot next time.'); await page.locator('#launch-notes').blur();
    await page.getByRole('button', { name: 'More launch actions' }).click(); await page.getByRole('button', { name: 'Duplicate with fresh progress' }).click(); await save(page);
    assert.match(await page.locator('h1').last().textContent(), /copy/); assert.match(await page.locator('.launch-meta').textContent(), /0 of 7/);
    await page.getByRole('tab', { name: /Distribute/ }).click(); await page.locator('[data-action="edit-task"]').click();
    assert.equal(await page.locator('#task-draft').inputValue(), ''); assert.equal(await page.locator('#task-url').inputValue(), ''); assert.match(await page.locator('#editor-content').textContent(), /Members found the screenshot helpful/);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Channels', exact: true }).click(); await page.locator('#library-search').fill('Chase'); await page.locator('[data-action="edit-channel"]').click(); assert.match(await page.locator('#editor-content').textContent(), /Synthetic CSR refresh/);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.reload(); await page.locator('#app').waitFor(); assert.equal(f.store.launches.length, 2); assert.equal(f.store.launches[0].value.tasks[0].owner, members[2].email);
    assert.ok(f.requests.every(item => item.headers.authorization.startsWith('Bearer test.'))); assert.deepEqual(f.errors, []); await page.close();
  } finally { await browser.close(); }
});
test('channel guidance can be edited, searched, archived, and retained without interpreting notes as HTML', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, store, errors } = await open(browser); await page.locator('#app').waitFor(); await page.getByRole('button', { name: 'Channels', exact: true }).click(); await page.getByRole('button', { name: 'Add channel', exact: false }).click();
    await page.locator('#channel-name').fill('Synthetic Capital One group'); await page.locator('#channel-tags').fill('capital one, venture x'); await page.locator('#channel-rules').fill('Native posts only. Checked against the group rules.'); await page.locator('#channel-date').fill('2026-10-15'); await page.locator('#channel-notes').fill('<img src=x onerror=window.injected=true>');
    await choose(page, 'External links', 'Native post only'); await choose(page, 'Rules status', 'Checked'); await save(page);
    await page.locator('#library-search').fill('venture x'); assert.equal(await page.locator('.compact-channel').count(), 1); await page.locator('[data-action="edit-channel"]').click(); assert.equal(await page.locator('#editor img').count(), 0);
    await page.locator('#channel-archived').check(); await save(page); assert.equal(await page.locator('.compact-channel').count(), 0); await page.locator('#show-archived').check(); assert.equal(await page.locator('.compact-channel').count(), 1);
    await page.getByText('All changes saved', { exact: true }).waitFor(); assert.ok(store.channels.some(record => record.value.name === 'Synthetic Capital One group' && record.value.archived)); assert.deepEqual(errors, []); await page.close();
  } finally { await browser.close(); }
});
test('failed saves retain the latest edit and retry successfully; conflicts preserve teammates’ versions', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const conflict of [false, true]) {
      const f = await open(browser, { failSaves: !conflict, conflict }), { page } = f; await page.locator('#app').waitFor(); await page.locator('[data-library-channel="chase"]').check(); await page.getByRole('button', { name: 'Create launch →', exact: true }).click(); await page.locator('#launch-name').fill('Keep this unsaved launch'); await save(page);
      await page.locator('#storage-error').waitFor(); assert.equal(await page.locator('#save-actions').isVisible(), true);
      if (conflict) { assert.equal(await page.locator('#retry-save').isVisible(), false); assert.match(await page.locator('#storage-error').textContent(), /teammate/); await page.getByRole('button', { name: 'Load latest', exact: true }).click(); await page.locator('.empty').waitFor(); assert.equal(f.store.launches.length, 0); }
      else { f.recover(); await page.getByRole('button', { name: 'Retry save', exact: true }).click(); await page.getByText('All changes saved', { exact: true }).waitFor(); assert.equal(f.store.launches[0].value.name, 'Keep this unsaved launch'); }
      assert.deepEqual(f.errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
test('signed-out and denied accounts remain locked; late responses cannot reopen private content', async () => {
  const browser = await chromium.launch({ headless: true }); let release;
  try {
    const out = await open(browser, { signedIn: false }); await out.page.locator('#sign-in input').waitFor(); assert.equal(out.requests.length, 0); await out.page.close();
    const denied = await open(browser, { denied: true }); await denied.page.getByText(/doesn’t have access/).waitFor(); assert.equal(await denied.page.locator('#app').isVisible(), false); assert.equal(await denied.page.locator('#content').textContent(), ''); await denied.page.close();
    const pendingRead = new Promise(resolve => { release = resolve; }), slow = await open(browser, { pendingRead }); await slow.page.waitForFunction(() => typeof window.changeLaunchSession === 'function');
    await slow.page.evaluate(() => window.changeLaunchSession({ session: null })); release(); await slow.page.locator('#sign-in input').waitFor(); assert.equal(await slow.page.locator('#content').textContent(), ''); assert.equal(await slow.page.locator('#app').isVisible(), false); await slow.page.close();
    const signedIn = await open(browser); await signedIn.page.locator('#app').waitFor(); await signedIn.page.getByRole('button', { name: 'Sign out', exact: true }).click(); await signedIn.page.locator('#sign-in input').waitFor(); assert.equal(await signedIn.page.locator('#content').textContent(), ''); assert.equal(await signedIn.page.evaluate(() => localStorage.length + sessionStorage.length), 0); await signedIn.page.close();
  } finally { release?.(); await browser.close(); }
});
test('desktop and phone layouts, opened searchable pickers, and empty search results fit the viewport', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const f = await open(browser, { viewport: { width, height: width === 1440 ? 1000 : 844 } }), { page } = f; await page.locator('#app').waitFor();
      await page.locator('[data-library-channel="chase"]').check(); await page.getByRole('button', { name: 'Create launch →', exact: true }).click(); await page.locator('#launch-name').fill('Synthetic launch');
      await page.getByRole('button', { name: /^Launch type:/ }).click(); const search = page.locator('.search-select-panel:not([hidden]) input'); await search.fill('no-such-option'); await page.locator('.search-select-panel:not([hidden]) .search-select-empty').waitFor(); await search.fill('Tool update'); await search.press('Enter'); await save(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
      await page.getByRole('button', { name: 'Edit details', exact: true }).click(); await page.getByRole('button', { name: /^Launch owner:/ }).click(); const panel = page.locator('.search-select-panel:not([hidden])'); const box = await panel.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.getByRole('button', { name: 'Channels', exact: true }).click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/private/tmp/nextcard-launches-library-${width}.png`, fullPage: true });
      assert.deepEqual(f.errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
