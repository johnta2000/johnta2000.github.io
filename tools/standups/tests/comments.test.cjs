const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

test('one visible comment at a time preserves drafts, replies, and responsive positioning', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const comments = [];
    let failSave = false;
    let delaySave;
    await page.addInitScript(() => {
      localStorage.setItem('standups:last-person-name', 'Jenny');
      window.Clerk = { load: async () => {}, isSignedIn: true,
        session: { getToken: async () => 'test-token' } };
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'localhost') {
        const file = url.pathname.endsWith('/') ? 'index.html' : path.basename(url.pathname);
        let body = await fs.readFile(path.join(__dirname, '..', file), 'utf8');
        if (file === 'index.html') body = body.replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, '');
        return route.fulfill({ body, contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      }
      if (url.hostname.endsWith('.convex.cloud')) {
        const { path: endpoint, args } = route.request().postDataJSON();
        let value = null;
        if (endpoint === 'standups:verify') value = { email: 'tester@example.com' };
        else if (endpoint === 'standups:listItemComments') value = comments.filter(c => c.personName === args.personName && c.standupDate === args.standupDate);
        else if (endpoint === 'standups:getForPersonAndDate') value = { personName: args.personName, updatedAt: Date.now(), standupDate: args.standupDate, yesterday: '<ul><li>Reviewed the launch plan</li></ul>', today: '<ul><li>Schedule posts for the week</li><li>Review campaign strategy</li></ul>', blockers: '', notes: '' };
        else if (endpoint === 'standups:saveItemComment') {
          if (delaySave) await delaySave;
          if (failSave) return route.fulfill({ json: { status: 'error', errorMessage: 'Test save failure' } });
          value = `comment-${comments.length}`;
          comments.push({ ...args, _id: value, personKey: args.personName.toLowerCase(), authorEmail: 'tester@example.com', createdAt: Date.now() });
        } else if (endpoint === 'standups:deleteItemComment') comments.splice(comments.findIndex(c => c._id === args.commentId), 1);
        else if (endpoint.includes('list')) value = [];
        return route.fulfill({ json: { status: 'success', value } });
      }
      return route.abort();
    });
    await page.goto('http://localhost/');
    await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Schedule posts'));
    const cards = page.locator('.comment-thread-panel');
    const visibleCards = page.locator('.comment-thread-panel:visible');
    const add = async (index = 0) => {
      await page.locator('#today li').nth(index).evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.locator('.rich-field').filter({ has: page.locator('#today') }).getByRole('button', { name: 'Comment', exact: true }).click();
    };
    await add();
    assert.equal(await cards.count(), 1);
    assert.equal(await page.locator('#today .has-comment-draft').count(), 1);
    assert.equal(await cards.first().locator('textarea').evaluate(el => el === document.activeElement), true);
    assert.equal(await cards.first().getByRole('button', { name: 'Comment', exact: true }).isDisabled(), true);
    await cards.first().locator('textarea').fill('First independent thread');
    await add();
    assert.equal(await cards.count(), 2);
    assert.equal(await cards.first().locator('textarea').inputValue(), 'First independent thread');
    assert.equal(await visibleCards.count(), 1);
    assert.equal(await cards.first().isHidden(), true);
    await cards.nth(1).locator('textarea').fill('Second independent thread');
    await page.locator('#commentsOverview button').first().click();
    assert.equal(await visibleCards.count(), 1);
    assert.equal(await cards.nth(1).isHidden(), true);
    assert.equal(await cards.first().locator('textarea').inputValue(), 'First independent thread');
    await cards.first().getByRole('button', { name: 'Comment', exact: true }).click();
    await cards.first().getByText('Comment added', { exact: true }).waitFor();
    await page.locator('#commentsOverview button').filter({ hasText: 'New comment' }).click();
    assert.equal(await visibleCards.count(), 1);
    assert.equal(await cards.nth(1).locator('textarea').inputValue(), 'Second independent thread');
    await cards.nth(1).getByRole('button', { name: 'Comment', exact: true }).click();
    await cards.nth(1).getByText('Comment added', { exact: true }).waitFor();
    assert.notEqual(comments[0].itemKey, comments[1].itemKey);
    assert.equal(comments[0].itemText, comments[1].itemText);
    assert.equal(await page.locator('#today .comment-marker').count(), 2);
    await page.locator('#commentsOverview button').filter({ hasText: 'First independent thread' }).click();
    assert.equal(await visibleCards.count(), 1);
    await cards.first().locator('textarea').fill('Reply to the first');
    await cards.first().getByRole('button', { name: 'Reply', exact: true }).click();
    await cards.first().getByText('Reply to the first', { exact: true }).waitFor();
    assert.equal(comments[2].itemKey, comments[0].itemKey);
    assert.equal(await cards.nth(1).locator('.comment-message').count(), 1);
    const box = await visibleCards.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 1600);
    assert.equal(await visibleCards.count(), 1);
    await page.screenshot({ path: '/tmp/standup-comments-desktop.png' });
    await cards.first().getByRole('button', { name: 'Close comment thread' }).click();
    assert.equal(await visibleCards.count(), 0);
    await page.locator('#today .comment-marker[data-count="2"]').click();
    assert.equal(await visibleCards.count(), 1);
    assert.equal(await cards.count(), 2);
    assert.equal(await cards.last().locator('.comment-message').count(), 2);
    await cards.last().locator('.comment-message').last().getByRole('button', { name: 'Remove' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.comment-thread-panel:last-child .comment-message').length === 1);
    failSave = true;
    await cards.last().locator('textarea').fill('Keep this draft after failure');
    await cards.last().getByRole('button', { name: 'Reply', exact: true }).click();
    await cards.last().getByText('Comment could not be saved. Try again.').waitFor();
    assert.equal(await cards.last().locator('textarea').inputValue(), 'Keep this draft after failure');
    failSave = false;
    await page.setViewportSize({ width: 390, height: 844 });
    const active = page.locator('.comment-thread-panel.is-active');
    await active.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const box = document.querySelector('.comment-thread-panel.is-active').getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    });
    const mobileBox = await active.boundingBox();
    assert.ok(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390);
    assert.equal(await page.locator('.comment-thread-panel:visible').count(), 1);
    await page.screenshot({ path: '/tmp/standup-comments-mobile.png' });
    await active.locator('textarea').press('Escape');
    assert.equal(await cards.count(), 1);
    assert.equal(await visibleCards.count(), 0);
    await page.locator('#commentsOverview button').filter({ hasText: 'Second independent thread' }).click();
    assert.equal(await visibleCards.count(), 1);
    await page.setViewportSize({ width: 1600, height: 1100 });
    let finishSave;
    delaySave = new Promise(resolve => { finishSave = resolve; });
    await cards.first().locator('textarea').fill('Save while switching person');
    const request = page.waitForRequest(req => req.postData()?.includes('Save while switching person'));
    await cards.first().getByRole('button', { name: 'Reply', exact: true }).click();
    await request;
    await page.locator('#personName').selectOption('John');
    assert.equal(await cards.count(), 0);
    finishSave();
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('Comment saved'));
    assert.equal(comments.at(-1).personName, 'Jenny');
    assert.equal(await cards.count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
