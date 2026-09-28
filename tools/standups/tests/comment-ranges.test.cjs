const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;

test('comments highlight exact selections across formatting, repeated text, reloads and edits', async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let today = '<ul><li>Review the <strong>launch</strong> plan with <em>Jenny</em>.</li><li>Review the launch plan again.</li><li>Investigate blockers<br>and follow up</li></ul>';
    const comments = [{ _id: 'legacy', personName: 'Jenny', personKey: 'jenny', fieldName: 'today', itemKey: 'item-legacy', itemText: 'Jenny', comment: 'An existing comment', createdAt: Date.now() }];
    await page.addInitScript(() => {
      localStorage.setItem('standups:last-person-name', 'Jenny');
      window.__internal_ClerkUICtor = {};
      window.Clerk = { load: async () => {}, isSignedIn: true, session: { getToken: async () => 'test-token' } };
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost') {
      if (url.pathname === '/assets/js/analytics.js') return route.fulfill({ body: '', contentType: 'text/javascript' });
        const file = url.pathname.endsWith('/') ? 'index.html' : path.basename(url.pathname);
        let body = await fs.readFile(path.join(__dirname, '..', file), 'utf8');
        if (file === 'index.html') body = body.replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, '');
        return route.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      }
      if (!url.hostname.endsWith('.convex.cloud')) return route.abort();
      const { path: endpoint, args } = route.request().postDataJSON();
      let value = null;
      if (endpoint === 'standups:verify') value = { email: 'tester@example.com' };
      else if (endpoint === 'standups:getForPersonAndDate') value = { today, yesterday: '<p>Prepared updates</p>', personName: 'Jenny', updatedAt: Date.now() };
      else if (endpoint === 'standups:save') { today = args.today; value = 'entry'; }
      else if (endpoint === 'standups:listItemComments') value = args.personName === 'Jenny' ? comments : [];
      else if (endpoint === 'standups:saveItemComment') {
        value = `comment-${comments.length}`;
        comments.push({ ...args, _id: value, personKey: 'jenny', createdAt: Date.now() });
      } else if (endpoint.includes('list')) value = [];
      return route.fulfill({ json: { status: 'success', value } });
    });
    await page.goto('http://localhost/');
    await page.waitForFunction(() => document.querySelectorAll('#today li').length === 3);
    const active = page.locator('.comment-thread-panel:visible');
    const add = () => page.locator('.rich-field').filter({ has: page.locator('#today') }).locator('[data-comment-editor]').click();
    const readRanges = () => page.evaluate(() => [...CSS.highlights.get('standup-comments')].map(range => ({ text: range.toString(), row: [...document.querySelectorAll('#today li')].indexOf(range.startContainer.parentElement.closest('li')) })));
    assert.deepEqual(await readRanges(), [{ text: 'Jenny', row: 0 }]);
    // Select the second occurrence of the same word, not the first match.
    await page.locator('#today li').nth(1).evaluate(li => {
      const node = li.firstChild;
      const start = node.textContent.indexOf('launch');
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 6);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await add();
    assert.equal(await active.locator('blockquote').textContent(), 'launch');
    assert.equal(await page.evaluate(() => [...CSS.highlights.get('standup-active-comment')][0].toString()), 'launch');
    assert.ok((await readRanges()).some(range => range.text === 'launch' && range.row === 1));
    assert.ok(await page.locator('#today li').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)')));
    await active.locator('textarea').fill('Only this word');
    await active.getByRole('button', { name: 'Comment', exact: true }).click();
    await active.getByText('Comment added', { exact: true }).waitFor();
    assert.equal(comments[1].itemText, 'launch');
    assert.ok(comments[1].itemKey.includes(':range-v1:'));
    await page.reload();
    await page.waitForFunction(() => CSS.highlights.get('standup-comments')?.size === 2);
    assert.ok((await readRanges()).some(range => range.text === 'launch' && range.row === 1));
    // A highlight itself can open its thread; no extra wrapper touches editor HTML.
    const point = await page.evaluate(() => {
      const range = [...CSS.highlights.get('standup-comments')].find(r => r.toString() === 'launch');
      const rect = range.getClientRects()[0]; getSelection().removeAllRanges();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await active.getByText('Only this word', { exact: true }).waitFor();
    await active.getByRole('button', { name: 'Close comment thread' }).click();
    // A selection across bold/emphasized runs should remain one exact range.
    await page.locator('#today li').first().evaluate(li => {
      const range = document.createRange(); range.setStart(li.firstChild, 7); range.setEnd(li.querySelector('em').firstChild, 5);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await add();
    assert.equal(await active.locator('blockquote').textContent(), 'the launch plan with Jenny');
    assert.equal(await page.evaluate(() => [...CSS.highlights.get('standup-active-comment')][0].toString()), 'the launch plan with Jenny');
    await page.screenshot({ path: `/tmp/standup-exact-highlights-${process.env.STANDUPS_BROWSER || 'chromium'}.png` });
    await active.getByRole('button', { name: 'Close comment thread' }).click();
    // Explicit line breaks and selections crossing list items retain their boundaries.
    await page.locator('#today li').nth(2).evaluate(li => {
      const range = document.createRange(); range.setStart(li.firstChild, 12); range.setEnd(li.lastChild, 13);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await add();
    assert.equal(await active.locator('blockquote').textContent(), 'blockers and follow up');
    assert.deepEqual(await page.evaluate(() => {
      const range = [...CSS.highlights.get('standup-active-comment')][0];
      return [range.startOffset, range.endOffset, range.startContainer.data, range.endContainer.data];
    }), [12, 13, 'Investigate blockers', 'and follow up']);
    await active.getByRole('button', { name: 'Close comment thread' }).click();
    await page.locator('#today').evaluate(editor => {
      const rows = editor.querySelectorAll('li');
      const range = document.createRange(); range.setStart(rows[0].querySelector('strong').firstChild, 2); range.setEnd(rows[1].firstChild, 17);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await add();
    assert.equal(await active.locator('blockquote').textContent(), 'unch plan with Jenny. Review the launch');
    assert.deepEqual(await page.evaluate(() => {
      const range = [...CSS.highlights.get('standup-active-comment')][0];
      return [range.startOffset, range.endOffset];
    }), [2, 17]);
    await active.getByRole('button', { name: 'Close comment thread' }).click();
    // Context anchors recover the selected occurrence when preceding text changes.
    await page.locator('#today li').nth(1).evaluate(li => {
      li.firstChild.insertData(0, 'Please ');
      li.closest('.rich-editor').dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    await page.reload();
    await page.waitForFunction(() => CSS.highlights.get('standup-comments')?.size === 2);
    assert.ok((await readRanges()).some(range => range.text === 'launch' && range.row === 1));
    assert.ok(!today.includes('highlight') && !today.includes('comment-marker'));
    assert.ok(today.includes('<strong>launch</strong>') && today.includes('<em>Jenny</em>'));
    // Removing the annotated word must not transfer its highlight to the other row.
    await page.locator('#today li').nth(1).evaluate(li => {
      const node = li.firstChild; node.deleteData(node.data.indexOf('launch'), 6);
      li.closest('.rich-editor').dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await page.waitForFunction(() => CSS.highlights.get('standup-comments').size === 1);
    assert.deepEqual(await readRanges(), [{ text: 'Jenny', row: 0 }]);
    await page.locator('#commentsOverview button').filter({ hasText: 'Only this word' }).click();
    await active.getByText('Only this word', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
