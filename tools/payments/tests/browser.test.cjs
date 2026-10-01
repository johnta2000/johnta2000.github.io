const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require('playwright');
const browserType = process.env.PAYMENTS_BROWSER === 'webkit' ? webkit : chromium;
function store() {
  return { accounts: [
    { _id: 'one', person: 'Alex', bank: 'Chase', nickname: '', dueDay: 1, startMonth: '2020-01' },
    { _id: 'two', person: 'Alex', bank: 'American Express', nickname: 'Travel', dueDay: 1, startMonth: '2020-01' },
    { _id: 'three', person: 'Dana', bank: 'Citi', nickname: '', dueDay: 1, startMonth: '2020-01' },
    { _id: 'four', person: 'Dana', bank: 'Bank of America', nickname: '', dueDay: 15, startMonth: '2020-01' },
  ], logs: [], files: [], requests: [], failSave: false, conflict: false, delayQuery: null };
}
async function open(browser, width = 390, db = store(), mode = 'signed-in') {
  const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 900, isMobile: width < 600 });
  page.setDefaultTimeout(7000); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(mode => {
    const token = 'test.' + btoa(JSON.stringify({ aud: 'convex' })) + '.test';
    const session = { id: 'test-session', getToken: async () => token };
    window.__internal_ClerkUICtor = {};
    window.Clerk = {
      session: mode === 'signed-out' ? null : session, load: async () => {},
      mountSignIn: element => { element.textContent = 'Sign in form'; }, unmountSignIn: element => { element.textContent = ''; },
      addListener(callback) { window.changeSession = session => { this.session = session; callback({ session }); }; },
      signOut: async () => window.changeSession(null),
    };
  }, mode);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') {
      if (url.pathname.startsWith('/assets/')) return route.fulfill({ body: await fs.readFile(path.join(__dirname, '../../..', url.pathname)), contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
      if (url.pathname.includes('/icons/')) return route.fulfill({ body: await fs.readFile(path.join(__dirname, '..', 'icons', path.basename(url.pathname))), contentType: url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png' });
      const filename = url.pathname.endsWith('/') ? 'index.html' : path.basename(url.pathname);
      let body = await fs.readFile(path.join(__dirname, '..', filename), 'utf8');
      if (filename === 'index.html') body = body.replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, '');
      return route.fulfill({ body, contentType: filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html' });
    }
    if (url.hostname.endsWith('.convex.site')) {
      if (!route.request().headers().authorization || mode !== 'signed-in') return route.fulfill({status:403});
      if (route.request().method() === 'POST') {
        if (db.failUpload) return route.fulfill({status:500,body:'Upload failed'});
        const key = route.request().headers()['x-request-key'];
        if (!db.files.some(f => f.requestKey === key)) db.files.push({_id:`file-${db.files.length}`,accountId:url.searchParams.get('id'),month:url.searchParams.get('month'),name:'receipt.png',requestKey:key});
        return route.fulfill({json:{}});
      }
      return route.fulfill({body:db.image || Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
    }
    if (!url.hostname.endsWith('.convex.cloud')) return route.abort();
    const { path: endpoint, args } = route.request().postDataJSON(); db.requests.push({ endpoint, args });
    let value = null;
    if (mode === 'denied') return route.fulfill({ json: { status: 'error', errorMessage: 'This account is not authorized for card payments.' } });
    if (endpoint === 'cardPayments:verify') value = { email: 'owner@example.com' };
    if (endpoint === 'cardPayments:dashboard') {
      const snapshot = JSON.parse(JSON.stringify({ accounts: db.accounts, logs: db.logs.filter(l => l.month === args.month), screenshotCounts: Object.fromEntries(db.accounts.map(a => [a._id, db.files.filter(f => f.accountId === a._id && f.month === args.month).length])) }));
      if (db.delayQuery) await db.delayQuery(args.month);
      value = snapshot;
    }
    if (endpoint === 'cardPayments:screenshots') value = db.files.filter(f => f.accountId === args.accountId && f.month === args.month);
    if (endpoint === 'cardPayments:removeScreenshot') db.files = db.files.filter(f => f._id !== args.id);
    if (endpoint === 'cardPayments:save') {
      if (db.delaySave) await db.delaySave(args);
      if (db.failSave) return route.abort('failed');
      const old = db.logs.find(l => l.accountId === args.accountId && l.month === args.month);
      if (db.conflict || (old?.version || 0) !== args.expectedVersion) return route.fulfill({ json: { status: 'error', errorMessage: 'This entry changed on another device. Refresh and review it before saving again.' } });
      const log = { ...old, ...args, version: (old?.version || 0) + 1, updatedAt: Date.now() };
      if (old) Object.assign(old, log); else db.logs.push(log);
      value = { version: log.version };
    }
    if (endpoint === 'cardPayments:addAccounts') {
      const before = db.accounts.length;
      for (const a of args.accounts) if (!db.accounts.some(b => b.bank === a.bank && b.person === a.person && b.nickname === a.nickname)) db.accounts.push({ ...a, startMonth: args.startMonth, _id: `account-${db.accounts.length}` });
      value = { added: db.accounts.length - before, skipped: args.accounts.length - (db.accounts.length - before) };
    }
    if (endpoint === 'cardPayments:updateAccount') Object.assign(db.accounts.find(a => a._id === args.accountId), args);
    if (endpoint === 'cardPayments:retire') db.accounts.find(a => a._id === args.accountId).endMonth = args.endMonth;
    return route.fulfill({ json: { status: 'success', value } });
  });
  await page.goto('http://localhost/');
  if (mode === 'signed-in') await page.locator('.account').first().waitFor();
  return { page, errors, db };
}
async function pick(page, id, label) {
  await page.locator(`#${id}-trigger`).click();
  await page.locator(`#${id}-panel`).getByRole('option', { name: label, exact: true }).click();
}
async function actions(page, id = 'one') {
  const row = page.locator(`[data-account="${id}"]`);
  if (await row.locator('.touch-actions').isVisible()) await row.locator('.touch-actions').click();
  else await row.locator('.quick-paid').click({ button: 'right' });
  await page.locator('#payment-menu').waitFor();
}
async function details(page, id = 'one') {
  // Details use confirmed versions; finish any quick save before opening them.
  await page.locator(`[data-account="${id}"]:not(.saving)`).waitFor();
  await actions(page, id); await page.locator('#menu-details').click();
}
async function fits(page) {
  const size = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(size[0] <= size[1], `Horizontal overflow: ${size}`);
}

test('mobile and desktop layouts fit, controls are tappable, and details stay within the viewport', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 390, 768, 1280]) {
      const { page, errors } = await open(browser, width);
      await fits(page);
      const heights = await page.locator('.quick-paid:visible, .details-button:visible, #previous, #next').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
      assert.ok(heights.every(h => h >= (width >= 900 ? 32 : 44)));
      await page.screenshot({ path: path.join(os.tmpdir(), `card-payments-${browserType.name()}-${width}.png`), fullPage: true });
      await details(page); await fits(page);
      assert.ok(await page.locator('#entry-amount').evaluate(n => parseFloat(getComputedStyle(n).fontSize) >= 16));
      const bounds = await page.locator('#entry-dialog').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});

test('phone checkoff persists on another device, months stay separate, flags are independent, and zero can be logged', async () => {
  const browser = await browserType.launch(); const db = store();
  try {
    const { page, errors } = await open(browser, 390, db);
    const month = await page.locator('#month').inputValue();
    await page.locator('[data-account="one"] .quick-paid').tap();
    await page.locator('[data-account="one"] .status-badge').filter({ hasText: 'Paid' }).waitFor();
    assert.equal(await page.locator('#progress-number').textContent(), '1 / 4');
    const desktop = (await open(browser, 1280, db)).page;
    assert.equal(await desktop.locator('[data-account="one"] .status-badge').textContent(), 'Paid');
    await details(page, 'two');
    await pick(page, 'entry-status', 'Not paid'); await page.locator('#entry-flag').check(); await page.locator('#entry-amount').fill('0'); await page.locator('#entry-note').fill('Scheduled for the first');
    await page.getByRole('button', { name: 'Save entry', exact: true }).tap();
    await page.locator('#entry-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.getElementById('progress-detail').textContent.includes('1 flagged'));
    assert.equal(await page.locator('#progress-number').textContent(), '1 / 4');
    assert.equal(db.logs.find(l => l.accountId === 'two').amountCents, 0);
    await page.locator('#remaining').check(); assert.equal(await page.locator('.account').count(), 3);
    await pick(page, 'person', 'Dana'); assert.equal(await page.locator('.account').count(), 2);
    await pick(page, 'person', 'Everyone'); await page.locator('#remaining').uncheck();
    await page.locator('#next').tap(); await page.waitForFunction(() => document.getElementById('progress-number').textContent === '0 / 4');
    await page.locator('#previous').tap(); await page.waitForFunction(() => document.getElementById('progress-number').textContent === '1 / 4');
    assert.equal(await page.locator('#month').inputValue(), month);
    await details(page, 'one'); await pick(page, 'entry-status', 'Not paid'); await page.getByRole('button', { name: 'Save entry', exact: true }).tap();
    await page.waitForFunction(() => document.getElementById('progress-number').textContent === '0 / 4');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('failed and conflicting saves never claim completion; user input is rendered as text', async () => {
  const browser = await browserType.launch(); const db = store();
  try {
    const { page, errors } = await open(browser, 390, db); db.failSave = true;
    await page.locator('[data-account="one"] .quick-paid').tap();
    await page.locator('#save-state').filter({ hasText: 'Couldn’t confirm' }).waitFor();
    assert.equal(await page.locator('[data-account="one"] .status-badge').textContent(), 'Not paid');
    db.failSave = false; db.conflict = true;
    await details(page, 'one'); await pick(page, 'entry-status', 'Paid'); await page.getByRole('button', { name: 'Save entry', exact: true }).tap();
    await page.locator('#entry-error').filter({ hasText: 'another device' }).waitFor();
    assert.equal(await page.locator('#entry-dialog').isVisible(), true); assert.equal(db.logs.length, 0);
    db.conflict = false;
    await page.locator('#entry-note').fill('<img src=x onerror=alert(1)>'); await page.getByRole('button', { name: 'Save entry', exact: true }).tap();
    await page.locator('.account-note').waitFor(); assert.equal(await page.locator('.account-note img').count(), 0);
    assert.equal(await page.locator('.account-note').textContent(), '<img src=x onerror=alert(1)>'); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('add, import with review, edit, retire, and reactivate accounts', async () => {
  const browser = await browserType.launch();
  try {
    const { page, db } = await open(browser);
    await page.locator('#add').tap(); await page.locator('#add-person').fill('Sam'); await page.locator('#add-bank').fill('Discover'); await page.getByRole('button', { name: 'Add account', exact: true }).tap();
    await page.waitForFunction(() => document.querySelectorAll('.account').length === 5);
    const content = JSON.stringify({ version: 1, accounts: [{ person: 'Sam', bank: 'Discover', nickname: '', dueDay: 1 }, { person: 'Sam', bank: 'Citi', nickname: '', dueDay: 1 }] });
    await page.locator('#import-file').setInputFiles({ name: 'accounts.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await page.locator('#import-dialog').waitFor(); assert.equal(db.accounts.length, 5);
    await page.getByRole('button', { name: 'Import accounts', exact: true }).tap(); await page.waitForFunction(() => document.querySelectorAll('.account').length === 6);
    assert.equal(db.accounts.length, 6);
    await page.locator('#manage').tap(); const item = page.locator('.manage-row').filter({ hasText: 'Sam · Discover' });
    await item.getByRole('button', { name: 'Edit', exact: true }).tap(); await page.locator('#add-day').fill('15'); await page.getByRole('button', { name: 'Save account', exact: true }).tap();
    await page.locator('#add-dialog').waitFor({ state: 'hidden' }); assert.equal(db.accounts.find(a => a.bank === 'Discover').dueDay, 15);
    await page.locator('#manage').tap(); await item.getByRole('button', { name: 'Retire', exact: true }).tap(); await item.getByRole('button', { name: 'Reactivate', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close account management' }).tap(); await page.locator('#next').tap(); await page.waitForFunction(() => document.querySelectorAll('.account').length === 5);
    await page.locator('#manage').tap(); await item.getByRole('button', { name: 'Reactivate', exact: true }).tap(); await item.getByRole('button', { name: 'Retire', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close account management' }).tap(); assert.equal(await page.locator('.account').count(), 6);
  } finally { await browser.close(); }
});

test('signed-out and denied sessions show no account data; late queries cannot restore data after sign-out', async () => {
  const browser = await browserType.launch();
  try {
    const signedOut = await open(browser, 390, store(), 'signed-out'); await signedOut.page.getByText('Sign in form').waitFor();
    assert.equal(signedOut.db.requests.length, 0); assert.equal(await signedOut.page.locator('#app').isVisible(), false);
    const denied = await open(browser, 390, store(), 'denied'); await denied.page.locator('#gate-message').filter({ hasText: 'doesn’t have access' }).waitFor();
    assert.equal(await denied.page.locator('.account').count(), 0);
    const { page, db } = await open(browser); let release;
    const pending = new Promise(resolve => { release = resolve; }); db.delayQuery = () => pending;
    const requested = page.waitForRequest(req => req.postData()?.includes('cardPayments:dashboard'));
    await page.locator('#refresh').tap(); await requested;
    await page.locator('#sign-out').tap(); release(); await page.getByText('Sign in form').waitFor();
    assert.equal(await page.locator('#app').isVisible(), false); assert.equal(await page.locator('.account').count(), 0); assert.equal(await page.locator('#entry-note').inputValue(), '');
  } finally { await browser.close(); }
});

test('a delayed old-month response cannot replace the selected month', async () => {
  const browser = await browserType.launch();
  try {
    const { page, db } = await open(browser); const initial = await page.locator('#month').inputValue();
    db.logs.push({ accountId: 'one', month: initial, status: 'paid', version: 1, updatedAt: Date.now() });
    let release; const pending = new Promise(resolve => { release = resolve; }); db.delayQuery = month => month === initial ? pending : Promise.resolve();
    const requested = page.waitForRequest(req => req.postData()?.includes('cardPayments:dashboard'));
    await page.locator('#refresh').tap(); await requested; await page.locator('#next').tap();
    await page.waitForFunction(() => document.querySelectorAll('.account').length === 4 && document.getElementById('progress-number').textContent === '0 / 4');
    release(); await pick(page, 'person', 'Alex'); assert.equal(await page.locator('#progress-number').textContent(), '0 / 2');
  } finally { await browser.close(); }
});

test('desktop matrix maps banks to people, keeps empty cells inert, and toggles individual accounts', async () => {
  const browser = await browserType.launch(); const db = store();
  db.accounts.push({ _id: 'five', person: 'Alex', bank: 'Chase', nickname: 'Second card', dueDay: 1, startMonth: '2020-01' });
  try {
    const { page, errors } = await open(browser, 1280, db);
    assert.equal(await page.locator('.payment-matrix').count(), 1);
    assert.deepEqual(await page.locator('thead th > span').allTextContents(), ['Alex', 'Dana']);
    assert.deepEqual(await page.locator('tbody th').allTextContents(), ['Chase', 'American Express', 'Citi', 'Bank of America']);
    const chase = page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: 'Chase', exact: true }) });
    assert.equal(await chase.locator('td').first().locator('[data-account]').count(), 2);
    assert.equal(await chase.locator('td').last().locator('button').count(), 0);
    assert.equal(await chase.locator('td').last().textContent(), '—');
    await page.locator('[data-account="one"] .quick-paid').click();
    await page.waitForFunction(() => document.querySelector('[data-account="one"] .quick-paid').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('[data-account="five"] .quick-paid').getAttribute('aria-pressed'), 'false');
    await page.locator('[data-account="one"] .quick-paid').click();
    await page.waitForFunction(() => document.querySelector('[data-account="one"] .quick-paid').getAttribute('aria-pressed') === 'false');
    await page.locator('[data-account="one"] .quick-paid').click();
    await page.waitForFunction(() => document.querySelector('[data-account="one"] .quick-paid').getAttribute('aria-pressed') === 'true');
    await page.locator('#remaining').check(); assert.equal(await page.locator('[data-account="one"]').count(), 0);
    assert.equal(await page.locator('[data-account="five"]').count(), 1);
    await page.locator('#remaining').uncheck();
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.payment-matrix').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-account="one"] .status-badge').textContent(), 'Paid');
    await fits(page); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('nine banks, five people and housing fit the desktop width', async () => {
  const browser = await browserType.launch(); const db = store();
  db.accounts = [];
  for (const bank of ['Chase', 'American Express', 'Discover', 'Citi', 'Barclays', 'Santander', 'Bilt', 'Bank of America', 'US Bank']) {
    for (const person of ['Alex', 'Blake', 'Casey', 'Business', 'Drew']) {
      db.accounts.push({ _id: `a-${db.accounts.length}`, bank, person, nickname: '', dueDay: 1, startMonth: '2020-01' });
    }
  }
  try {
    db.accounts.push(...['Rent', 'Mortgage', 'Other rent'].map((bank, i) => ({ _id: `housing-${i}`, bank, person: 'Alex', category: 'housing', nickname: '10 Example Street', dueDay: 1, startMonth: '2020-01' })));
    const { page } = await open(browser, 1000, db); await fits(page);
    assert.equal(await page.locator('thead th').count(), 6);
    const layout = await page.locator('.matrix-scroll').evaluate(n => ({ scroll: n.scrollWidth, width: n.clientWidth }));
    assert.ok(layout.scroll <= layout.width, 'Five people fit without horizontal scrolling');
    await page.setViewportSize({ width: 1280, height: 720 }); await fits(page);
    assert.equal(await page.locator('.bank-icon img').count(), 9);
    await page.screenshot({ path: path.join(os.tmpdir(), `card-payments-matrix-${browserType.name()}.png`), fullPage: true });
  } finally { await browser.close(); }
});

test('rapid checkoffs and flags render immediately, save per account, and survive rapid undo', async () => {
  const browser = await browserType.launch(); const db = store();
  try {
    const { page } = await open(browser, 1280, db);
    let release; const delayed = new Promise(resolve => { release = resolve; }); db.delaySave = () => delayed;
    await page.locator('[data-account="one"] .quick-paid').click();
    assert.equal(await page.locator('[data-account="one"] .quick-paid').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-account="two"] .quick-paid').isEnabled(), true);
    await page.locator('[data-account="two"] .quick-paid').click();
    await actions(page, 'one'); await page.locator('#menu-flag').click();
    await page.locator('[data-account="one"] .quick-paid').click();
    assert.equal(await page.locator('[data-account="one"] .quick-paid').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-account="one"] .flag-marker').count(), 1);
    assert.equal(db.logs.length, 0);
    release(); await page.locator('#save-state').filter({ hasText: 'All changes saved' }).waitFor();
    assert.equal(db.logs.find(l => l.accountId === 'one').status, 'unchecked');
    assert.equal(db.logs.find(l => l.accountId === 'one').flagged, true);
    assert.equal(db.logs.find(l => l.accountId === 'two').status, 'paid');
    const other = (await open(browser, 1280, db)).page;
    assert.equal(await other.locator('[data-account="one"] .flag-marker').count(), 1);
    assert.equal(await other.locator('[data-account="two"] .quick-paid').getAttribute('aria-pressed'), 'true');
  } finally { await browser.close(); }
});
test('pending saves stay scoped to their month and do not restore a signed-out screen', async () => {
  const browser = await browserType.launch(); const db = store();
  try {
    const { page } = await open(browser, 1280, db); const month = await page.locator('#month').inputValue();
    let release; const delayed = new Promise(resolve => { release = resolve; }); db.delaySave = () => delayed;
    await page.locator('[data-account="one"] .quick-paid').click();
    await page.locator('#next').click(); await page.locator('[data-account="one"]').waitFor();
    assert.equal(await page.locator('[data-account="one"] .quick-paid').getAttribute('aria-pressed'), 'false');
    release(); await page.locator('#save-state').filter({ hasText: 'All changes saved' }).waitFor();
    assert.equal(db.logs[0].month, month);
    assert.equal(await page.locator('[data-account="one"] .quick-paid').getAttribute('aria-pressed'), 'false');
    let releaseSecond; const second = new Promise(resolve => { releaseSecond = resolve; }); db.delaySave = () => second;
    await page.locator('[data-account="two"] .quick-paid').click(); await page.locator('#sign-out').click(); releaseSecond();
    await page.getByText('Sign in form').waitFor(); assert.equal(await page.locator('.account').count(), 0);
  } finally { await browser.close(); }
});

test('desktop context menu hides extra controls, supports keyboard and edge positioning, and preserves payment status', async () => {
 const browser = await browserType.launch(); const db = store();
 try {
  const { page } = await open(browser, 1280, db);
  assert.equal(await page.locator('.touch-actions:visible').count(), 0);
  const paid = page.locator('[data-account="one"] .quick-paid');
  await paid.click({ button: 'right' });
  assert.equal(await paid.getAttribute('aria-pressed'), 'false'); assert.equal(db.logs.length, 0);
  await page.locator('#menu-flag').click(); await page.locator('#save-state').filter({ hasText: 'All changes saved' }).waitFor();
  assert.equal(db.logs[0].flagged, true); assert.equal(db.logs[0].status, 'unchecked');
  await paid.focus(); await page.keyboard.press('Shift+F10'); await page.locator('#payment-menu').waitFor();
  await page.keyboard.press('ArrowDown'); assert.equal(await page.locator('#menu-details').evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#payment-menu').isVisible(), false);
  assert.equal(await paid.evaluate(n => n === document.activeElement), true);
  await actions(page); await page.locator('#menu-details').click(); await page.locator('#entry-dialog').waitFor();
  assert.equal(await page.locator('#entry-flag').isChecked(), true); await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await paid.click(); await page.locator('#save-state').filter({ hasText: 'All changes saved' }).waitFor();
  const fills = await page.locator('[data-account="one"] .quick-paid').evaluate(n => [getComputedStyle(n).backgroundColor, getComputedStyle(n.parentElement).backgroundColor]);
  assert.equal(fills[0], fills[1]);
  await page.locator('[data-account="four"]').dispatchEvent('contextmenu', { clientX: 1278, clientY: 718 });
  const box = await page.locator('#payment-menu').boundingBox(); assert.ok(box.x + box.width <= 1280 && box.y + box.height <= 844);
  await page.screenshot({ path: path.join(os.tmpdir(), `card-payments-context-${browserType.name()}.png`), fullPage: true });
  await page.locator('h1').click(); assert.equal(await page.locator('#payment-menu').isVisible(), false);
 } finally { await browser.close(); }
});

test('searchable pickers filter people, support keyboard selection, and work inside a modal', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await open(browser, 390);
    await page.locator('#person-trigger').click();
    const search = page.getByRole('combobox', { name: 'Search person' });
    await search.fill('dAn');
    assert.equal(await page.getByRole('option').count(), 1);
    await search.press('Enter');
    assert.equal(await page.locator('#person').inputValue(), 'Dana');
    assert.equal(await page.locator('.account').count(), 2);
    assert.equal(await page.locator('#person-trigger').textContent(), 'Dana');
    await page.locator('#person-trigger').press('z');
    assert.equal(await search.inputValue(), 'z');
    await page.locator('#person-panel').getByText('No matches. Try another search.').waitFor();
    await search.press('Escape');
    assert.equal(await page.locator('#person-trigger').evaluate(n => n === document.activeElement), true);
    await pick(page, 'person', 'Everyone');
    await details(page);
    await page.locator('#entry-status-trigger').click();
    const statusSearch = page.getByRole('combobox', { name: 'Search status' });
    await statusSearch.press('ArrowDown'); await statusSearch.press('Enter');
    assert.equal(await page.locator('#entry-status').inputValue(), 'paid');
    await page.locator('#entry-status-trigger').click();
    await statusSearch.fill('not');
    assert.equal(await page.getByRole('option').count(), 1);
    await statusSearch.press('Escape');
    assert.equal(await page.locator('#entry-dialog').isVisible(), true, 'Escape dismisses only the picker');
    await page.getByRole('button', { name: 'Save entry', exact: true }).click();
    await page.locator('#entry-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-account="one"] .quick-paid').getAttribute('aria-pressed'), 'true');
    await details(page);
    assert.equal(await page.locator('#entry-status-trigger').textContent(), 'Paid', 'programmatic value changes sync');
    await page.locator('#entry-status-trigger').click(); await statusSearch.press('Tab');
    assert.equal(await page.locator('#entry-status-panel').isVisible(), false);
    const nextFocus = await page.evaluate(() => document.activeElement.id);
    assert.ok(['entry-flag', 'entry-amount'].includes(nextFocus), `Tab should advance to the next form control; focused ${nextFocus}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('picker panels stay on screen, scroll long lists, and close on outside click or sign-out', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 390, 1280]) {
      const db = store();
      for (let i = 0; i < 25; i++) db.accounts.push({ ...db.accounts[0], _id: `extra-${i}`, person: `Person ${i}` });
      const { page, errors } = await open(browser, width, db);
      await page.locator('#person-trigger').click();
      const panel = page.locator('#person-panel');
      let bounds = await panel.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 844);
      assert.ok(await page.locator('#person-options').evaluate(n => n.scrollHeight > n.clientHeight));
      const search = page.getByRole('combobox', { name: 'Search person' });
      await search.fill('person 24'); await search.press('Enter');
      assert.equal(await page.locator('.account').count(), 1);
      await page.locator('#person-trigger').click();
      await page.screenshot({ path: path.join(os.tmpdir(), `payments-picker-${browserType.name()}-${width}.png`), fullPage: true });
      await page.setViewportSize({ width, height: 450 });
      await page.waitForFunction(() => document.getElementById('person-panel').getBoundingClientRect().bottom <= 450);
      bounds = await panel.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 450, `Picker should fit a reduced viewport: ${JSON.stringify(bounds)}`);
      await page.setViewportSize({ width, height: 844 });
      await page.locator('h1').click(); assert.equal(await panel.isVisible(), false);
      await page.locator('#person-trigger').click();
      await page.locator('#person').evaluate(n => { n.disabled = true; });
      await panel.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#person-trigger').isDisabled(), true);
      await page.locator('#person').evaluate(n => { n.disabled = false; });
      await page.locator('#person-trigger').click();
      await page.evaluate(() => window.changeSession(null));
      await page.locator('#app').waitFor({ state: 'hidden' });
      assert.equal(await panel.isVisible(), false);
      assert.equal(await page.locator('#person').textContent(), 'Everyone');
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});

test('housing lives below the card matrix, repeats monthly, saves instantly, and follows filters', async () => {
  const browser = await browserType.launch();
  try {
    const db = store();
    db.accounts.push(
      { _id: 'rent', category: 'housing', person: 'Alex', bank: 'Rent', nickname: '10 Example Street', dueDay: 1, startMonth: '2020-01' },
      { _id: 'mortgage', category: 'housing', person: 'Alex', bank: 'Mortgage', nickname: '20 Example Street', dueDay: 1, startMonth: '2020-01' },
      { _id: 'rent2', category: 'housing', person: 'Dana', bank: 'Rent', nickname: '30 Example Street', dueDay: 1, startMonth: '2020-01' }
    );
    const { page, errors } = await open(browser, 1280, db);
    assert.equal(await page.locator('#housing-accounts .account').count(), 3);
    assert.equal(await page.locator('#accounts .account').count(), 4);
    assert.ok(!(await page.locator('.payment-matrix').innerText()).includes('Rent'));
    const matrix = await page.locator('#accounts').boundingBox(), housing = await page.locator('#housing-section').boundingBox();
    assert.ok(housing.y >= matrix.y + matrix.height);
    let release; db.delaySave = () => new Promise(r => { release = r; });
    await page.locator('[data-account="rent"] .quick-paid').click();
    assert.equal(await page.locator('[data-account="rent"] .quick-paid').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => document.getElementById('save-state').textContent.includes('Saving'));
    while (!release) await new Promise(r => setTimeout(r, 10));
    db.delaySave = null; release(); await page.locator('[data-account="rent"]:not(.saving)').waitFor();
    await actions(page, 'rent'); await page.locator('#menu-flag').click();
    await page.locator('[data-account="rent"]:not(.saving)').waitFor();
    await page.locator('#next').click();
    await page.waitForFunction(() => document.getElementById('housing-progress').textContent.startsWith('0 / 3'));
    assert.equal(await page.locator('[data-account="rent"] .flag-marker').count(), 0);
    await page.locator('#previous').click();
    await page.waitForFunction(() => document.getElementById('housing-progress').textContent.startsWith('1 / 3'));
    assert.equal(await page.locator('[data-account="rent"] .flag-marker').count(), 1);
    await pick(page, 'person', 'Alex'); assert.equal(await page.locator('#housing-accounts .account').count(), 2);
    await page.locator('#remaining').check(); assert.equal(await page.locator('#housing-accounts .account').count(), 1);
    await page.locator('#remaining').uncheck(); await pick(page, 'person', 'Everyone');
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await fits(page);
      await page.screenshot({ path: path.join(os.tmpdir(), `housing-${browserType.name()}-${width}.png`), fullPage: true });
    }
    await page.locator('#add').click(); await pick(page, 'add-category', 'Housing Payments');
    assert.equal(await page.locator('#add-bank-label').textContent(), 'Payment type');
    assert.equal(await page.locator('#add-nickname-label').textContent(), 'Address');
    await page.getByLabel('Close add account', { exact: true }).click();
    await page.locator('#sign-out').click();
    assert.equal(await page.locator('#housing-accounts').textContent(), '');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('payment screenshots preview failed uploads, retry once, persist for the month, and clear on sign-out', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [390, 1280]) {
      const db = store(); db.accounts[0].category = 'housing'; db.accounts[0].bank = 'Rent'; db.failUpload = true;
      const { page, errors } = await open(browser, width, db);
      const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 720; c.height = 360; const x = c.getContext('2d'); x.fillStyle = '#f3f7f2'; x.fillRect(0,0,720,360); x.fillStyle = '#276347'; x.font = 'bold 32px sans-serif'; x.fillText('Payment confirmation',40,80); x.font = '22px sans-serif'; x.fillText('Example rent · October',40,135); x.fillText('Synthetic receipt for layout testing',40,210); return c.toDataURL().split(',')[1]; });
      db.image = Buffer.from(image, 'base64');
      await page.getByRole('button', {name:'Screenshots for Alex, Rent',exact:true}).click();
      await page.locator('#screenshot-add:not([disabled])').waitFor();
      await page.locator('#screenshot-input').setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:db.image});
      await page.getByRole('button', {name:'Retry upload',exact:true}).waitFor();
      assert.equal(await page.locator('.payment-screenshot img').count(),1);
      await page.locator('#screenshots-close').click(); assert.ok(await page.locator('#screenshots-dialog').isVisible());
      db.failUpload = false; await page.getByRole('button',{name:'Retry upload',exact:true}).click();
      await page.waitForFunction(() => document.getElementById('screenshot-state').textContent.includes('Screenshots saved'));
      await page.locator('.payment-screenshot img').waitFor();
      assert.equal(db.files.length,1); assert.equal(db.logs.length,0);
      await fits(page); await page.screenshot({path:path.join(os.tmpdir(),`payment-receipt-${browserType.name()}-${width}.png`),fullPage:true});
      await page.locator('#screenshots-close').click();
      await page.locator('#next').click(); await page.locator('[data-account="one"] .screenshot-link').waitFor();
      await page.getByRole('button',{name:'Screenshots for Alex, Rent',exact:true}).click();
      await page.locator('.screenshot-empty').waitFor(); assert.equal(await page.locator('.payment-screenshot').count(),0);
      await page.locator('#screenshots-close').click(); await page.locator('#previous').click();
      await page.locator('[data-account="one"] .screenshot-link').filter({hasText:'1 screenshot'}).waitFor();
      await page.getByRole('button',{name:'Screenshots for Alex, Rent',exact:true}).click(); await page.locator('.payment-screenshot img').waitFor();
      await page.evaluate(() => window.changeSession(null));
      assert.equal(await page.locator('#payment-screenshots').textContent(),''); assert.ok(!(await page.locator('#screenshots-dialog').isVisible()));
      assert.deepEqual(errors,[]); await page.close();
    }
  } finally { await browser.close(); }
});
