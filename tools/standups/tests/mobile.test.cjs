const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const screenshotSuffix = process.env.STANDUPS_BROWSER === 'webkit' ? '-webkit' : '';

const { openStandups, assertNoOverflow } = require('./fixtures.cjs');

test('phone and tablet layouts keep headings, editors, and date controls in bounds', async () => {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const width of [320, 375, 390, 430, 768, 844, 1024, 1101, 1280]) {
      const { page, errors } = await openStandups(browser, width, width === 844 ? 390 : 844);
      await assertNoOverflow(page);
      const heading = await page.locator('.topbar h1').boundingBox();
      assert.ok(heading.height < 110, `Title wraps excessively at ${width}px`);
      for (const selector of ['#standupDate', '#lockButton', '#personName-trigger', '#today', '.form-actions']) {
        if (selector === '#personName-trigger' && width >= 1280) {
          assert.equal(await page.locator(selector).isVisible(), false, 'Desktop teammate tabs replace the duplicate picker');
          continue;
        }
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${selector} outside ${width}px viewport`);
      }
      const buttons = await page.locator('.date-navigation button').evaluateAll(nodes => nodes.map(node => {
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
    await page.locator('#personName-trigger').tap();
    await page.getByRole('combobox', { name: 'Search team member' }).fill('John');
    await page.getByRole('option', { name: 'John', exact: true }).tap();
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates");
    await page.locator('#today').fill('Writing an update from my phone');
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    assert.ok(mutations.some(m => m.endpoint === 'standups:save' && m.args.personName === 'John' && m.args.today.includes('Writing an update from my phone')));
    await page.locator('#dailyNotes').fill('Shared context entered on a phone');
    await page.waitForFunction(() => document.querySelector('#dailyNotesStatus').textContent.startsWith('Last saved'));
    assert.ok(mutations.some(m => m.endpoint === 'standups:saveDayNotes' && m.args.notes.includes('Shared context entered on a phone')));
    const initialDate = await page.locator('#standupDate').inputValue();
    await page.locator('[data-date-step="-1"]').tap();
    await page.waitForFunction(date => document.querySelector('#standupDate').value !== date && document.querySelector('#today').textContent.includes('Schedule posts'), initialDate);
    await page.locator('[data-date-jump="0"]').tap();
    await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Writing an update from my phone'));
    await page.locator('#today').evaluate(node => {
      node.focus();
      const range = document.createRange(); range.selectNodeContents(node);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    const toolbar = page.locator('#documentToolbar');
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
