const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const screenshotSuffix = process.env.STANDUPS_BROWSER === 'webkit' ? '-webkit' : '';

async function openStandups(browser, width, height = 844) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width <= 760, hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const entries = new Map();
  const comments = [];
  const mutations = [];
  await page.addInitScript(() => {
    localStorage.setItem('standups:last-person-name', 'Jenny');
    window.Clerk = { load: async () => {}, isSignedIn: true,
      session: { getToken: async () => 'test-token' } };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') {
      const name = url.pathname.endsWith('/') ? 'index.html' : path.basename(url.pathname);
      let body = await fs.readFile(path.join(__dirname, '..', name), 'utf8');
      if (name === 'index.html') body = body.replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, '');
      return route.fulfill({ body, contentType: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html' });
    }
    if (!url.hostname.endsWith('.convex.cloud')) return route.abort();
    const { path: endpoint, args } = route.request().postDataJSON();
    const key = `${args.personName}:${args.standupDate}`;
    let value = null;
    if (url.pathname.endsWith('/mutation')) mutations.push({ endpoint, args });
    if (endpoint === 'standups:verify') value = { email: 'a.long.account.address@example.com' };
    else if (endpoint === 'standups:getForPersonAndDate') value = entries.get(key) || {
      personName: args.personName, standupDate: args.standupDate, updatedAt: Date.now(),
      yesterday: '<ul><li>Reviewed launch plans</li></ul>', today: '<ul><li>Schedule posts for the week</li><li>Review campaign strategy</li></ul>', blockers: '', notes: '',
    };
    else if (endpoint === 'standups:getPreviousForPerson') value = { personName: args.personName, standupDate: '2026-09-14', today: '<ul><li>Follow up on the previous plan</li></ul>' };
    else if (endpoint === 'standups:save') { entries.set(key, { ...args, updatedAt: Date.now() }); value = 'entry-1'; }
    else if (endpoint === 'standups:saveItemComment') {
      value = `comment-${comments.length}`;
      comments.push({ ...args, _id: value, personKey: args.personName.toLowerCase(), authorEmail: 'tester@example.com', createdAt: Date.now() });
    } else if (endpoint === 'standups:listItemComments') value = comments.filter(c => c.personName === args.personName && c.standupDate === args.standupDate);
    else if (endpoint.includes('list')) value = [];
    return route.fulfill({ json: { status: 'success', value } });
  });
  await page.goto('http://localhost/');
  await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Schedule posts') && !document.querySelector('#previousContent').textContent.includes('Looking for'));
  return { page, errors, comments, mutations };
}

async function assertNoOverflow(page) {
  const sizes = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(sizes.document <= sizes.viewport + 1, `Page overflows: ${JSON.stringify(sizes)}`);
}

test('phone and tablet layouts keep headings, editors, and date controls in bounds', async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const width of [320, 375, 390, 430, 768, 844, 1024, 1101, 1280]) {
      const { page, errors } = await openStandups(browser, width, width === 844 ? 390 : 844);
      await assertNoOverflow(page);
      const heading = await page.locator('.topbar h1').boundingBox();
      assert.ok(heading.height < 110, `Title wraps excessively at ${width}px`);
      for (const selector of ['#standupDate', '#lockButton', '#personName', '#today', '.form-actions']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${selector} outside ${width}px viewport`);
      }
      const buttons = await page.locator('.date-jump button').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, height: box.height, width: node.clientWidth, content: node.scrollWidth };
      }));
      if (width <= 760) {
        assert.ok(buttons.every(button => button.height >= 44 && button.content <= button.width + 1));
        assert.ok(buttons.every((button, i) => !i || button.left >= buttons[i - 1].right));
        const today = await page.locator('.today-panel').boundingBox();
        const previous = await page.locator('.previous-panel').boundingBox();
        assert.ok(today.y < previous.y, 'Editing should come before previous submissions on a phone');
        assert.ok(await page.locator('#today').evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16));
        const controls = await page.locator('.editor-toolbar button').evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, scroll: node.scrollWidth, height: node.getBoundingClientRect().height })));
        assert.ok(controls.every(control => control.height >= 44 && control.scroll <= control.width + 1), 'Formatting controls must fit and have touch height');
      }
      if ([320, 390, 768, 1280].includes(width)) await page.screenshot({ path: `/tmp/standup-mobile-${width}${screenshotSuffix}.png` });
      if (width === 390) await page.screenshot({ path: `/tmp/standup-mobile-full${screenshotSuffix}.png`, fullPage: true });
      await page.locator('#notes').fill('A long pasted link: https://example.com/' + 'campaign'.repeat(30));
      await assertNoOverflow(page);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('phone editing, autosave, dates, comments, and reduced keyboard viewport', async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    const { page, mutations, comments, errors } = await openStandups(browser, 390);
    await page.locator('#personName').selectOption('John');
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates");
    await page.locator('#today').fill('Writing an update from my phone');
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    assert.ok(mutations.some(m => m.endpoint === 'standups:save' && m.args.personName === 'John' && m.args.today.includes('Writing an update from my phone')));
    await page.locator('#dailyNotes').fill('Shared context entered on a phone');
    await page.waitForFunction(() => document.querySelector('#dailyNotesStatus').textContent.startsWith('Last saved'));
    assert.ok(mutations.some(m => m.endpoint === 'standups:saveDayNotes' && m.args.notes.includes('Shared context entered on a phone')));
    const initialDate = await page.locator('#standupDate').inputValue();
    await page.locator('[data-date-jump="-1"]').tap();
    await page.waitForFunction(date => document.querySelector('#standupDate').value !== date && document.querySelector('#today').textContent.includes('Schedule posts'), initialDate);
    await page.locator('[data-date-jump="0"]').tap();
    await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Writing an update from my phone'));
    await page.locator('#today').evaluate(node => {
      node.focus();
      const range = document.createRange(); range.selectNodeContents(node);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    const toolbar = page.locator('.rich-field').filter({ has: page.locator('#today') });
    await toolbar.locator('[data-command="bold"]').tap();
    await page.waitForFunction(() => [...document.querySelectorAll('#today b, #today strong')].some(node => node.textContent.includes('Writing an update from my phone')));
    await toolbar.locator('[data-comment-editor]').tap();
    const popup = page.locator('.comment-thread-panel:visible');
    await popup.waitFor({ state: 'visible' });
    await popup.locator('textarea').fill('A comment from my phone');
    await popup.getByRole('button', { name: 'Comment', exact: true }).tap();
    await popup.getByText('Comment added', { exact: true }).waitFor();
    assert.equal(comments.length, 1);
    await popup.locator('textarea').fill('Draft reply with the keyboard open');
    // Simulate the visual viewport Safari exposes when the software keyboard opens.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 340 });
      Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, get: () => 65 });
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => {
      const panel = document.querySelector('.comment-thread-panel.is-active');
      const box = panel.getBoundingClientRect();
      return box.top >= 65 && box.bottom <= 405;
    });
    assert.equal(await page.locator('.form-actions').isVisible(), false);
    await popup.getByRole('button', { name: 'Reply', exact: true }).scrollIntoViewIfNeeded();
    await popup.getByRole('button', { name: 'Reply', exact: true }).tap();
    await popup.getByText('Comment added', { exact: true }).waitFor();
    assert.equal(comments.length, 2);
    await page.evaluate(() => {
      delete visualViewport.height; delete visualViewport.offsetTop;
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.locator('.form-actions').waitFor({ state: 'visible' });
    await page.screenshot({ path: `/tmp/standup-mobile-comment${screenshotSuffix}.png` });
    await popup.getByRole('button', { name: 'Close comment thread' }).tap();
    assert.equal(await page.locator('.comment-thread-panel:visible').count(), 0);
    await assertNoOverflow(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
