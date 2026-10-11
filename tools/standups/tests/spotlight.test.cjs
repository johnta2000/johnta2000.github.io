const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups, assertNoOverflow } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const suffix = process.env.STANDUPS_BROWSER === 'webkit' ? '-webkit' : '';

async function assertAtSubmissionStart(page) {
  const boxes = await page.evaluate(() => ({
    bar: document.querySelector('#meetingControls').getBoundingClientRect().toJSON(),
    panel: document.querySelector('.today-panel').getBoundingClientRect().toJSON(),
  }));
  assert.ok(boxes.bar.top >= 0 && boxes.bar.top <= 24, 'Navigation stays in reach');
  assert.ok(boxes.panel.top >= boxes.bar.bottom && boxes.panel.top < boxes.bar.bottom + 32, 'New submission starts beneath navigation');
}

async function addMockComments(fixture) {
  const date = await fixture.page.locator('#standupDate').inputValue();
  fixture.comments.push(
    { _id: 'jenny-comment', personName: 'Jenny', personKey: 'jenny', standupDate: date, fieldName: 'today', itemKey: 'test-item', itemText: 'Schedule posts for the week', comment: 'Discuss the publishing schedule', authorEmail: 'test@example.com', createdAt: Date.now() },
    { _id: 'john-comment', personName: 'John', personKey: 'john', standupDate: date, fieldName: 'today', itemKey: 'test-john-item', itemText: 'Schedule posts for the week', comment: 'John private discussion context', authorEmail: 'test@example.com', createdAt: Date.now() },
  );
  await fixture.page.evaluate(() => reloadItemComments());
}

test('sticky controls switch teammates and jump to sections without visiting the bottom roster', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1440, 900);
    await page.locator('#notes').fill(Array.from({ length: 40 }, (_, i) => `Long discussion note ${i}`).join('\n'));
    await page.locator('#notes').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => scrollY > 500));
    const nav = await page.locator('#meetingControls').boundingBox();
    assert.ok(nav.y >= 0 && nav.y < 2);
    await page.locator('[data-person-jump="John"]').click();
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates" && document.querySelector('#today').isContentEditable);
    await assertAtSubmissionStart(page);
    await page.getByRole('button', { name: 'Next teammate', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "Vivek's updates" && document.querySelector('#today').isContentEditable);
    await assertAtSubmissionStart(page);
    await page.getByRole('button', { name: 'Previous teammate', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates" && document.querySelector('#today').isContentEditable);
    await page.locator('[data-section-jump="today"]').click();
    const boxes = await page.evaluate(() => ({ toolbar: document.querySelector('#documentToolbar').getBoundingClientRect().bottom, section: document.querySelector('#today').closest('.rich-field').getBoundingClientRect().top }));
    assert.ok(boxes.section >= boxes.toolbar, 'Section title clears the pinned toolbar');
    await assertNoOverflow(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('spotlight hides side content and highlights, allows deliberate comments and resets them per teammate', async () => {
  const browser = await browserType.launch();
  try {
    const fixture = await openStandups(browser, 1440, 900);
    const { page, mutations, errors } = fixture;
    await addMockComments(fixture);
    await page.locator('#commentsOverview button').filter({ hasText: 'Discuss the publishing schedule' }).click();
    await page.locator('.comment-thread-panel:visible textarea').fill('Unsaved comment draft');
    await page.getByRole('button', { name: 'Spotlight', exact: true }).click();
    for (const selector of ['.daily-list', '.previous-panel', '#documentToolbar', '.form-actions', '.comment-thread-panel:visible']) {
      assert.equal(await page.locator(selector).isVisible(), false, `${selector} stays out of the presentation`);
    }
    assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'false');
    assert.equal(await page.locator('#today').getAttribute('aria-readonly'), 'true');
    assert.equal(await page.locator('#today .comment-marker:visible').count(), 0);
    assert.equal(await page.evaluate(() => CSS.highlights?.get('standup-comments')?.size || 0), 0);
    assert.equal(await page.locator('#blockers').isVisible(), false);
    await page.screenshot({ path: `/tmp/standup-spotlight-desktop${suffix}.png` });
    await page.getByRole('button', { name: 'Show comments', exact: true }).click();
    assert.equal(await page.locator('.comments-card').isVisible(), true);
    assert.equal(await page.locator('.daily-notes-card').isVisible(), false);
    assert.equal(await page.locator('#commentsOverview').getByText('John private discussion context').count(), 0);
    await page.locator('#commentsOverview button').filter({ hasText: 'Discuss the publishing schedule' }).click();
    assert.equal(await page.locator('.comment-thread-panel:visible textarea').inputValue(), 'Unsaved comment draft');
    await page.getByRole('button', { name: 'Hide comments', exact: true }).click();
    assert.equal(await page.locator('.comment-thread-panel:visible').count(), 0);
    await page.getByRole('button', { name: 'Show comments', exact: true }).click();
    await page.getByRole('button', { name: 'Next teammate', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates" && document.querySelector('#today').getAttribute('aria-disabled') === 'false');
    assert.equal(await page.locator('.comments-card').isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Show comments', exact: true }).getAttribute('aria-pressed'), 'false');
    await assertAtSubmissionStart(page);
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).click();
    assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'true');
    assert.equal(await page.locator('.daily-list').isVisible(), true);
    assert.equal(await page.locator('#documentToolbar').isVisible(), true);
    assert.equal(mutations.length, 0, 'Presentation controls do not change standup data');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

async function captureWorkspacePositions(page) {
  return page.evaluate(() => {
    const selectors = ['#meetingControls', '#spotlightToggle', '#spotlightCommentsToggle', '#shortcutSettingsButton', '#standupDate', '#nextPerson', '#previousPerson', '.today-panel', '#todayTitle', '#yesterday', '#today', '#blockers', '#notes'];
    const boxes = Object.fromEntries(selectors.map(selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return [selector, { x, y, width, height }];
    }));
    const range = document.createRange();
    const text = document.querySelector('#today li').firstChild;
    range.selectNodeContents(text);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { boxes, text: { x, y, width, height }, scrollY, pageHeight: document.documentElement.scrollHeight };
  });
}

function assertUnmoved(before, after, context) {
  for (const [selector, box] of Object.entries(before.boxes)) {
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(box[key] - after.boxes[selector][key]) <= 1, `${context}: ${selector} ${key} changed from ${box[key]} to ${after.boxes[selector][key]}`);
    }
  }
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before.text[key] - after.text[key]) <= 1, `${context}: submission text ${key} moved`);
  assert.equal(after.scrollY, before.scrollY, `${context}: scroll position stays fixed`);
  assert.equal(after.pageHeight, before.pageHeight, `${context}: page height stays fixed`);
}

test('Spotlight, discussions and exit preserve document geometry and scroll position', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 390, 768, 1280, 1440]) {
      const fixture = await openStandups(browser, width, 900);
      const { page, errors } = fixture;
      await addMockComments(fixture);
      await page.locator('#notes').fill(Array.from({ length: 35 }, (_, i) => `Long discussion context ${i}`).join('\n'));
      await page.evaluate(() => scrollToSubmission(document.querySelector('#today')));
      const before = await captureWorkspacePositions(page);
      await page.locator('#spotlightToggle').click();
      await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
      assertUnmoved(before, await captureWorkspacePositions(page), `${width}px: enter`);
      assert.equal(await page.locator('.previous-panel').evaluate(element => element.inert), true);
      assert.equal(await page.locator('.daily-list').evaluate(element => element.inert), true);
      await page.locator('#spotlightCommentsToggle').click();
      assertUnmoved(before, await captureWorkspacePositions(page), `${width}px: show discussions`);
      assert.equal(await page.locator('.daily-list').evaluate(element => element.inert), false);
      await page.locator('#spotlightCommentsToggle').click();
      assertUnmoved(before, await captureWorkspacePositions(page), `${width}px: hide discussions`);
      if (width === 1440) await page.screenshot({ path: `/tmp/standup-stable-spotlight${suffix}.png` });
      await page.locator('#spotlightToggle').click();
      await page.getByRole('button', { name: 'Spotlight', exact: true }).waitFor();
      assertUnmoved(before, await captureWorkspacePositions(page), `${width}px: exit`);
      assert.equal(await page.locator('.previous-panel').evaluate(element => element.inert), false);
      assert.equal(await page.locator('#spotlightCommentsToggle').isVisible(), false);
      await assertNoOverflow(page);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('spotlight saves pending edits and stays in editing mode when that save fails', async () => {
  const browser = await browserType.launch();
  try {
    const { page, controls, entries, errors } = await openStandups(browser, 1280);
    controls.failSave = true;
    await page.locator('#today').fill('Draft prepared before the team call');
    await page.getByRole('button', { name: 'Spotlight', exact: true }).click();
    await page.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Spotlight', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'true');
    controls.failSave = false;
    await page.getByRole('button', { name: 'Spotlight', exact: true }).click();
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    const date = await page.locator('#standupDate').inputValue();
    assert.ok(entries.get(`Jenny:${date}`).today.includes('Draft prepared before the team call'));
    assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'false');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('spotlight navigation stays usable on phone, tablet and desktop, including date changes', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 390, 768, 1280]) {
      const { page, errors } = await openStandups(browser, width, 900);
      await page.getByRole('button', { name: 'Spotlight', exact: true }).click();
      await assertNoOverflow(page);
      for (const selector of ['#meetingControls', '#standupDate', '#nextPerson', '#spotlightToggle', '.today-panel']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${selector} fits ${width}px`);
      }
      await page.locator('#standupDate').fill('2026-09-22');
      await page.waitForFunction(() => document.querySelector('#todayEyebrow').textContent.includes('Sep 22') && document.querySelector('#today').getAttribute('aria-disabled') === 'false');
      assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'false');
      await page.getByRole('button', { name: 'Next teammate', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates" && document.querySelector('#today').getAttribute('aria-disabled') === 'false');
      await assertAtSubmissionStart(page);
      await page.getByRole('button', { name: 'Show comments', exact: true }).click();
      await assertNoOverflow(page);
      await page.getByRole('button', { name: 'Hide comments', exact: true }).click();
      if (width === 390) await page.screenshot({ path: `/tmp/standup-spotlight-mobile${suffix}.png` });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
