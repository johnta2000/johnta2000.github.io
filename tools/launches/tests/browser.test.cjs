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
async function open(browser, { signedIn = true, denied = false, pendingRead, failSaves = false, conflict = false, viewport = { width: 1440, height: 1000 }, workspace = initial(), search = '' } = {}) {
  const page = await browser.newPage({ viewport }), errors = [], requests = [], store = structuredClone(workspace);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(({ signedIn }) => {
    const token = 'test.' + btoa(JSON.stringify({ aud: 'convex' })) + '.test', session = { id: 'synthetic-session', getToken: async () => token };
    window.syntheticLaunchSession = session;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.copiedLaunchText = value; } }, configurable: true });
    window.__internal_ClerkUICtor = {};
    window.Clerk = { session: signedIn ? session : null, load: async () => {}, addListener(fn) { window.changeLaunchSession = fn; },
      mountSignIn(mount, options) { window.launchSignInOptions = options; mount.innerHTML = '<div class="cl-cardBox"><div class="cl-card"><h2 class="cl-headerTitle">Sign in</h2><label>Email<input type="email"></label><button>Continue</button></div></div>'; },
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
  await page.goto('https://www.john-ta.com/tools/launches/' + search);
  return { page, errors, requests, store, recover() { failSaves = false; conflict = false; } };
}
async function choose(page, label, value) {
  const control = page.getByRole('button', { name: new RegExp(`^${label}:`) });
  if (!await control.isVisible() && await page.locator('.optional-launch-details').count()) await page.locator('.optional-launch-details>summary').click();
  await control.click();
  const search = page.locator('.search-select-panel:not([hidden]) input'); await search.fill(value); await search.press('Enter');
}
async function changeMedium(page, scope, medium) {
  const button = page.locator(`[data-action="${scope}-medium"][data-medium="${medium}"]`);
  if (await button.isVisible()) await button.click();
  else await choose(page, 'Distribution medium', M.media[medium] || (medium === 'selected' ? 'Selected' : 'All media'));
}
async function save(page) { await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.locator('#editor').waitFor({ state: 'hidden' }); }

function routeWorkspace() {
  const workspace = initial(), value = M.newLaunch(members[0].email);
  value.name = 'Saved routing example'; value.summary = 'A saved private brief.';
  value.tasks.push({ ...M.addTask(workspace.channels[0], members[0].email), id: 'task-one', draft: 'Saved private post copy.' });
  value.checks.push({ id: 'check-one', stage: 'prepare', label: 'A saved checklist note', done: true, owner: '' });
  workspace.launches.push({ key: 'launch-one', value, version: 1, createdAt: 1, updatedAt: 1 });
  return workspace;
}

test('an edit link survives sign-in, opens in a fresh session, reloads, and updates the same saved launch', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const search = '?launch=launch-one&step=prepare&edit=launch';
    const first = await open(browser, { signedIn: false, workspace: routeWorkspace(), search }), { page } = first;
    await page.locator('#sign-in input').waitFor(); assert.equal(first.requests.length, 0); assert.equal(await page.locator('#launch-name').count(), 0);
    const options = await page.evaluate(() => window.launchSignInOptions);
    assert.equal(options.forceRedirectUrl, 'https://www.john-ta.com/tools/launches/' + search); assert.equal(options.signUpForceRedirectUrl, options.forceRedirectUrl);
    await page.evaluate(() => { window.Clerk.session = window.syntheticLaunchSession; window.changeLaunchSession({ session: window.Clerk.session }); });
    await page.locator('#launch-name').waitFor(); assert.equal(await page.locator('#launch-name').inputValue(), 'Saved routing example');
    await page.getByRole('button', { name: 'Copy link to this screen', exact: true }).click(); const copied = await page.evaluate(() => window.copiedLaunchText);
    assert.equal(new URL(copied).searchParams.get('edit'), 'launch'); assert.equal(new URL(copied).searchParams.get('launch'), 'launch-one');
    const second = await open(browser, { workspace: first.store, search: new URL(copied).search });
    await second.page.locator('#launch-name').waitFor(); assert.equal(await second.page.locator('#launch-name').inputValue(), 'Saved routing example');
    await second.page.reload(); await second.page.locator('#launch-name').waitFor();
    await second.page.locator('#launch-name').fill('Edited through a shared link'); await save(second.page); await second.page.getByText('All changes saved', { exact: true }).waitFor();
    assert.equal(second.store.launches.length, 1); assert.equal(second.store.launches[0].key, 'launch-one'); assert.equal(second.store.launches[0].value.name, 'Edited through a shared link');
    assert.equal(new URL(second.page.url()).searchParams.get('edit'), null); assert.equal(new URL(second.page.url()).searchParams.get('launch'), 'launch-one');
    assert.deepEqual(first.errors, []); assert.deepEqual(second.errors, []); await page.close(); await second.page.close();
  } finally { await browser.close(); }
});

test('all routed editors load directly without creating or changing records, and Escape restores their parent view', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [search, selector, parameter] of [
      ['?channel=chase', '#channel-name', 'channel'],
      ['?view=channels&edit=new-channel', '#channel-name', 'edit'],
      ['?launch=launch-one&task=task-one', '#task-draft', 'task'],
      ['?launch=launch-one&step=prepare&check=check-one', '#check-name', 'check'],
      ['?launch=launch-one&step=prepare&edit=material', '#material-name', 'edit'],
      ['?launch=launch-one&edit=actions', '[data-action="duplicate-launch"]', 'edit'],
      ['?launch=launch-one&guidance=chase', '.guidance-text', 'guidance'],
      ['?launch=launch-one&step=choose&channel=chase', '#channel-name', 'channel'],
    ]) {
      const f = await open(browser, { workspace: routeWorkspace(), search }); await f.page.locator(selector).first().waitFor();
      assert.ok(!f.requests.some(request => /:saveLaunch$|:saveChannel$/.test(request.payload.path)));
      await f.page.keyboard.press('Escape'); await f.page.locator('#editor').waitFor({ state: 'hidden' });
      await f.page.waitForFunction(parameter => !new URL(location.href).searchParams.has(parameter), parameter);
      assert.deepEqual(f.errors, []); await f.page.close();
    }
  } finally { await browser.close(); }
});

test('view, medium, modal, Back, and Forward stay synchronized with the address bar', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors } = await open(browser, { workspace: routeWorkspace() }); await page.locator('#app').waitFor();
    await changeMedium(page, 'library', 'email'); assert.equal(new URL(page.url()).searchParams.get('medium'), 'email');
    await page.getByRole('button', { name: 'Launches', exact: true }).click(); assert.equal(new URL(page.url()).searchParams.get('view'), 'launches');
    await page.locator('[data-action="open-launch"]').click();
    assert.equal(new URL(page.url()).searchParams.get('step'), 'choose'); await page.getByRole('button', { name: 'Edit details', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('edit'), 'launch');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); assert.equal(new URL(page.url()).searchParams.get('edit'), null);
    await page.goBack(); await page.locator('#launch-name').waitFor(); assert.equal(new URL(page.url()).searchParams.get('edit'), 'launch');
    await page.goForward(); await page.locator('#editor').waitFor({ state: 'hidden' }); assert.equal(new URL(page.url()).searchParams.get('edit'), null);
    await page.reload(); await page.locator('.channel-checklist').waitFor(); assert.equal(await page.locator('[role=tab]').count(), 0);
    await page.getByRole('button', { name: 'Launches', exact: true }).click(); await page.getByRole('button', { name: 'Completed', exact: true }).click();
    await page.reload(); await page.locator('[data-action="launch-filter"][data-filter="complete"]').waitFor(); assert.equal(await page.locator('[data-filter="complete"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []); await page.close();
  } finally { await browser.close(); }
});

test('Back can be cancelled while editing without losing typed changes', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors } = await open(browser, { workspace: routeWorkspace(), search: '?launch=launch-one&step=prepare' }); await page.locator('#app').waitFor();
    await page.getByRole('button', { name: 'Edit details', exact: true }).click(); await page.locator('#launch-name').fill('Keep these unsaved words');
    page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.dismiss());
    await page.goBack(); await page.waitForURL(url => url.searchParams.get('edit') === 'launch');
    assert.equal(await page.locator('#launch-name').inputValue(), 'Keep these unsaved words');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); assert.deepEqual(errors, []); await page.close();
  } finally { await browser.close(); }
});

test('invalid and missing links show an unavailable page; access denial never opens a private editor', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const search of ['?launch=missing-launch&edit=launch', '?launch=%3Cimg%20src=x%3E', '?launch=launch-one&task=missing', '?channel=missing']) {
      const f = await open(browser, { workspace: routeWorkspace(), search }); await f.page.getByRole('heading', { name: /unavailable$/ }).waitFor();
      assert.equal(await f.page.locator('#editor').isVisible(), false); assert.ok(!f.requests.some(request => /:saveLaunch$|:saveChannel$/.test(request.payload.path))); assert.deepEqual(f.errors, []); await f.page.close();
    }
    const f = await open(browser, { denied: true, workspace: routeWorkspace(), search: '?launch=launch-one&edit=launch' }); await f.page.getByText(/doesn’t have access/).waitFor(); assert.equal(await f.page.locator('#launch-name').count(), 0); await f.page.close();
  } finally { await browser.close(); }
});

test('copied routes omit authentication fragments, arbitrary tokens, and private content', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors } = await open(browser, { workspace: routeWorkspace(), search: '?launch=launch-one&edit=launch&token=PRIVATE#clerk-secret' }); await page.locator('#launch-name').waitFor();
    await page.getByRole('button', { name: 'Copy link to this screen', exact: true }).click();
    const url = await page.evaluate(() => window.copiedLaunchText); assert.doesNotMatch(url, /PRIVATE|secret|routing|Saved|example\.com|token=/); assert.equal(new URL(url).hash, '');
    assert.deepEqual(errors, []); await page.close();
  } finally { await browser.close(); }
});

test('Channels is the starting view; medium changes and global searches keep selections until a launch is created', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, store, requests, errors } = await open(browser); await page.locator('#app').waitFor();
    assert.equal(await page.locator('[data-view="channels"]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.compact-channel').count(), 4);
    assert.equal(await page.locator('[data-action="library-medium"][data-medium="all"]').getAttribute('aria-pressed'), 'true');
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
    assert.equal(await page.locator('.channel-checklist').isVisible(), true); assert.equal(await page.locator('[role=tab]').count(), 0);
    assert.equal(await page.locator('#chooser-medium-select').inputValue(), 'all');
    await page.locator('[data-action="chooser-medium"][data-medium="email"]').click();
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
      assert.equal(await page.locator('.compact-channel').count(), 24);
      assert.equal(await page.locator('#library-medium-select').inputValue(), 'all');
      await changeMedium(page, 'library', 'facebook');
      assert.equal(await page.locator('.compact-channel').count(), 9);
      await page.reload(); await page.locator('#app').waitFor();
      assert.equal(await page.locator('#library-medium-select').inputValue(), 'facebook');
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

test('a launch is a single channel checklist; optional saved drafts remain accessible and duplication resets them', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const f = await open(browser), { page } = f; await page.locator('#app').waitFor();
    await page.locator('[data-library-channel="chase"]').check(); await page.getByRole('button', { name: 'Create launch →', exact: true }).click();
    await page.locator('#launch-name').fill('Synthetic CSR refresh'); await page.locator('#source-url').fill('https://example.com/source');
    await choose(page, 'Launch type', 'Tool update'); await save(page); await page.getByText('All changes saved', { exact: true }).waitFor();
    assert.equal(f.store.launches[0].value.checks.length, 0);
    assert.equal(await page.locator('[role=tab], .step-nav, .aside-stack, .progress-track').count(), 0);
    assert.equal(await page.locator('.saved-launch-context').count(), 0); assert.match(await page.locator('.launch-meta').textContent(), /1 channel selected/);
    await page.locator('[data-action="edit-task"]').click();
    await page.locator('#task-draft').fill('An existing optional draft.'); await choose(page, 'Task owner', 'Andrew'); await save(page);
    await page.locator('[data-action="edit-task"]').click(); assert.equal(await page.locator('#task-draft').inputValue(), 'An existing optional draft.');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Edit details', exact: true }).click(); await page.locator('.optional-launch-details>summary').click(); await page.locator('#launch-notes').fill('Saved context.'); await save(page);
    await page.locator('.saved-launch-context>summary').click(); assert.match(await page.locator('.saved-launch-context').textContent(), /Saved context/);
    await page.getByRole('button', { name: 'Copy checklist', exact: true }).click();
    const copied = await page.evaluate(() => window.copiedLaunchText); assert.match(copied, /- \[ \] Synthetic Chase group/); assert.doesNotMatch(copied, /Preparation|Follow-up/);
    await page.getByRole('button', { name: 'More launch actions' }).click(); await page.getByRole('button', { name: 'Duplicate with fresh progress' }).click(); await save(page);
    await page.locator('[data-action="edit-task"]').click(); assert.equal(await page.locator('#task-draft').inputValue(), ''); await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByText('All changes saved', { exact: true }).waitFor(); assert.equal(f.store.launches.length, 2); assert.equal(f.store.launches[0].value.tasks[0].draft, 'An existing optional draft.');
    await page.reload(); await page.locator('.channel-checklist').waitFor(); assert.deepEqual(f.errors, []); await page.close();
  } finally { await browser.close(); }
});

test('every legacy stage link opens the same checklist and preserves earlier notes, checks, and channel activity', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const step of ['choose', 'prepare', 'distribute', 'followup']) {
      const workspace = routeWorkspace(); workspace.launches[0].value.notes = 'Keep our earlier notes';
      const f = await open(browser, { workspace, search: `?launch=launch-one&step=${step}` }), { page } = f;
      await page.locator('.channel-checklist').waitFor(); assert.equal(await page.locator('[role=tab]').count(), 0);
      assert.equal(new URL(page.url()).searchParams.get('step'), 'choose');
      assert.match(await page.locator('.launch-meta').textContent(), /1 channel selected/);
      assert.ok(!f.requests.some(item => item.payload.path.endsWith(':saveLaunch')));
      await page.locator('.saved-launch-context>summary').click(); assert.match(await page.locator('.saved-launch-context').textContent(), /Keep our earlier notes/);
      await page.getByText('Earlier checklist notes', { exact: true }).click(); assert.match(await page.locator('.saved-launch-context').textContent(), /A saved checklist note/);
      await page.locator('[data-channel="ihg"]').check(); await page.getByText('All changes saved', { exact: true }).waitFor();
      assert.equal(f.store.launches[0].value.notes, 'Keep our earlier notes'); assert.equal(f.store.launches[0].value.checks[0].done, true); assert.equal(f.store.launches[0].value.tasks[0].draft, 'Saved private post copy.');
      assert.deepEqual(f.errors, []); await page.close();
    }
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
      if (conflict) { assert.equal(await page.locator('#retry-save').isVisible(), false); assert.match(await page.locator('#storage-error').textContent(), /teammate/); await page.getByRole('button', { name: 'Load latest', exact: true }).click(); await page.getByRole('heading', { name: 'Launch unavailable', exact: true }).waitFor(); assert.equal(f.store.launches.length, 0); }
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
      await page.locator('.optional-launch-details>summary').click(); await page.getByRole('button', { name: /^Launch type:/ }).click(); const search = page.locator('.search-select-panel:not([hidden]) input'); await search.fill('no-such-option'); await page.locator('.search-select-panel:not([hidden]) .search-select-empty').waitFor(); await search.fill('Tool update'); await search.press('Enter'); await save(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
      await page.getByRole('button', { name: 'Edit details', exact: true }).click(); await page.locator('.optional-launch-details>summary').click(); await page.getByRole('button', { name: /^Launch owner:/ }).click(); const panel = page.locator('.search-select-panel:not([hidden])'); const box = await panel.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.getByRole('button', { name: 'Channels', exact: true }).click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/private/tmp/nextcard-launches-library-${width}.png`, fullPage: true });
      assert.deepEqual(f.errors, []); await page.close();
    }
  } finally { await browser.close(); }
});


test('visible Remove actions save launch changes, preserve the library, and protect saved work on desktop and phones', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const workspace = routeWorkspace();
      workspace.launches[0].value.tasks.push(M.addTask(workspace.channels[1], members[0].email));
      const f = await open(browser, { workspace, search: '?launch=launch-one&step=choose', viewport: { width, height: 1000 } }), { page } = f;
      await page.locator('#app').waitFor();
      await changeMedium(page, 'chooser', 'selected');
      const removeChase = page.getByRole('button', { name: 'Remove Synthetic Chase group from this launch', exact: true });
      assert.equal(await removeChase.isVisible(), true);
      const box = await removeChase.boundingBox(); assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      assert.equal(await page.locator('[data-action="remove-launch-channel"]').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Chooser overflow at ${width}`);
      await page.screenshot({ path: `/private/tmp/nextcard-launches-remove-${width}.png`, fullPage: true });
      page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.dismiss());
      await removeChase.click(); assert.equal(await page.locator('[data-channel="chase"]').isChecked(), true);
      assert.equal(f.store.launches[0].value.tasks.length, 2);
      assert.ok(!f.requests.some(item => item.payload.path.endsWith(':saveLaunch')));
      await page.getByRole('button', { name: 'Remove Synthetic editorial contact from this launch', exact: true }).click();
      await page.getByText('All changes saved', { exact: true }).waitFor();
      assert.equal(f.store.launches[0].value.tasks.length, 1); assert.equal(f.store.channels.length, 4);
      assert.match(await page.locator('.launch-meta').textContent(), /1 channel selected/);
      assert.equal(await page.locator('[data-channel="outreach"]').count(), 0);
      await page.reload(); await page.locator('#app').waitFor(); assert.equal(f.store.launches[0].value.tasks.length, 1);
      await changeMedium(page, 'chooser', 'email'); await page.locator('[data-channel="outreach"]').check();
      await page.getByText('All changes saved', { exact: true }).waitFor(); assert.equal(f.store.launches[0].value.tasks.length, 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Checklist overflow at ${width}`);
      page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
      await changeMedium(page, 'chooser', 'selected');
      await page.getByRole('button', { name: 'Remove Synthetic Chase group from this launch', exact: true }).click();
      await page.getByText('All changes saved', { exact: true }).waitFor();
      assert.deepEqual(f.store.launches[0].value.tasks.map(task => task.channelKey), ['outreach']);
      assert.equal(f.store.channels.length, 4); assert.deepEqual(f.errors, []); await page.close();
    }
  } finally { await browser.close(); }
});


test('irrelevant unselected options can be hidden from a zero-selection launch and restored without changing the library or other launches', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const workspace = routeWorkspace(); workspace.launches[0].value.tasks = [];
      delete workspace.launches[0].value.hiddenChannelKeys; // Existing launches predate this optional field.
      workspace.launches.push({ ...structuredClone(workspace.launches[0]), key: 'other-launch' });
      const f = await open(browser, { workspace, search: '?launch=launch-one&step=choose', viewport: { width, height: 1000 } }), { page } = f;
      await page.locator('#app').waitFor();
      const hide = page.getByRole('button', { name: 'Hide Synthetic Chase group for this launch', exact: true });
      assert.equal(await hide.isVisible(), true); assert.equal(await page.locator('[data-action="remove-launch-channel"]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `/private/tmp/nextcard-launches-hide-${width}.png`, fullPage: true });
      if (width === 390) await page.locator('.compact-channel').first().screenshot({ path: '/private/tmp/nextcard-launches-hide-button.png' });
      await hide.click(); await page.getByText('All changes saved', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-channel="chase"]').count(), 0); assert.deepEqual(f.store.launches[0].value.hiddenChannelKeys, ['chase']);
      assert.equal(f.store.launches[0].value.tasks.length, 0); assert.equal(f.store.launches[1].value.hiddenChannelKeys, undefined); assert.equal(f.store.channels.length, 4);
      await page.reload(); await page.locator('#app').waitFor(); assert.equal(await page.locator('[data-channel="chase"]').count(), 0);
      await page.locator('#hidden-channels-summary').click(); await page.getByRole('button', { name: 'Restore Synthetic Chase group for this launch', exact: true }).click();
      await page.getByText('All changes saved', { exact: true }).waitFor(); assert.deepEqual(f.store.launches[0].value.hiddenChannelKeys, []);
      await page.locator('[data-action="edit-channel"][data-key="chase"]').click();
      assert.match(await page.locator('.launch-channel-context').textContent(), /not included/);
      const context = page.locator('.launch-channel-context'); assert.equal(await context.getByRole('button', { name: 'Hide Synthetic Chase group for this launch', exact: true }).isVisible(), true);
      await page.locator('#channel-name').fill('Do not save this accidental library edit');
      page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.dismiss());
      await context.getByRole('button', { name: 'Hide Synthetic Chase group for this launch', exact: true }).click(); assert.equal(await page.locator('#editor').isVisible(), true);
      assert.deepEqual(f.store.launches[0].value.hiddenChannelKeys, []);
      page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
      await context.getByRole('button', { name: 'Hide Synthetic Chase group for this launch', exact: true }).click(); await page.locator('#editor').waitFor({ state: 'hidden' });
      await page.getByText('All changes saved', { exact: true }).waitFor(); assert.deepEqual(f.store.launches[0].value.hiddenChannelKeys, ['chase']);
      assert.equal(f.store.channels[0].value.name, 'Synthetic Chase group'); assert.equal(new URL(page.url()).searchParams.has('channel'), false);
      assert.ok(!f.requests.some(item => item.payload.path.endsWith(':saveChannel'))); assert.deepEqual(f.errors, []); await page.close();
    }
  } finally { await browser.close(); }
});


test('audience labels and Edit channel open the shared editor directly without changing channel selection', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const workspace = routeWorkspace(); workspace.channels.find(item => item.key === 'ihg').value.tags = [];
      const f = await open(browser, { workspace, search: '?launch=launch-one', viewport: { width, height: 1000 } }), { page } = f;
      await page.locator('.channel-checklist').waitFor();
      const audience = page.getByRole('button', { name: 'Edit audience for Synthetic IHG group', exact: true });
      assert.match(await audience.textContent(), /Add audience tags/);
      await audience.click(); await page.locator('#channel-tags').waitFor();
      assert.equal(await page.locator('#channel-tags').evaluate(element => element === document.activeElement), true);
      assert.equal(await page.locator('.guidance-text').count(), 0); assert.equal(new URL(page.url()).searchParams.get('channel'), 'ihg');
      assert.ok(!f.requests.some(item => item.payload.path.endsWith(':saveLaunch') || item.payload.path.endsWith(':saveChannel')));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#channel-tags').fill('alaska, mileage plan'); await page.locator('#channel-fit').fill('Alaska news and helpful redemption examples.');
      const saveBox = await page.getByRole('button', { name: 'Save changes', exact: true }).boundingBox();
      assert.ok(saveBox.y >= 0 && saveBox.y + saveBox.height <= 1000, `Save stays visible at ${width}`);
      await page.screenshot({ path: `/private/tmp/nextcard-channel-editor-${width}.png`, fullPage: true });
      await save(page); await page.getByText('All changes saved', { exact: true }).waitFor();
      assert.deepEqual(f.store.channels.find(item => item.key === 'ihg').value.tags, ['alaska', 'mileage plan']);
      assert.equal(f.store.launches[0].value.tasks.length, 1); assert.equal(await page.locator('[data-channel="ihg"]').isChecked(), false);
      assert.match(await audience.textContent(), /alaska · mileage plan/);
      assert.ok(!f.requests.some(item => item.payload.path.endsWith(':saveLaunch')));
      await page.getByRole('button', { name: 'Edit channel Synthetic Chase group', exact: true }).click(); await page.locator('#channel-name').waitFor();
      assert.equal(await page.locator('#task-draft').count(), 0); await page.keyboard.press('Escape'); await page.locator('#editor').waitFor({ state: 'hidden' });
      await page.waitForURL(url => !url.searchParams.has('channel'));
      await page.reload(); await page.locator('.channel-checklist').waitFor(); assert.match(await audience.textContent(), /alaska · mileage plan/);
      await page.getByRole('button', { name: 'Channels', exact: true }).click();
      await page.getByRole('button', { name: 'Edit audience for Synthetic IHG group', exact: true }).click();
      assert.equal(await page.locator('#channel-tags').inputValue(), 'alaska, mileage plan');
      await page.keyboard.press('Escape'); assert.deepEqual(f.errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
