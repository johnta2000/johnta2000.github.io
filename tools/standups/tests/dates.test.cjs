const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups, assertNoOverflow } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const suffix = process.env.STANDUPS_BROWSER === 'webkit' ? '-webkit' : '';

test('day controls navigate from the selected date, cross month boundaries and preserve drafts', async () => {
  const browser = await browserType.launch();
  try {
    const { page, entries, errors } = await openStandups(browser, 1280);
    const today = await page.locator('#standupDate').inputValue();
    await page.locator('#standupDate').fill('2026-09-30');
    await page.waitForFunction(() => document.querySelector('#today').isContentEditable && document.querySelector('#todayEyebrow').textContent.includes('Sep 30'));
    await page.locator('#today').fill('Save this draft to September 30');
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#today').isContentEditable && document.querySelector('#todayEyebrow').textContent.includes('Oct 1'));
    assert.equal(await page.locator('#standupDate').inputValue(), '2026-10-01');
    assert.ok(entries.get('Jenny:2026-09-30').today.includes('Save this draft to September 30'));
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Save this draft to September 30'));
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#today').isContentEditable && document.querySelector('#todayEyebrow').textContent.includes('Sep 29'));
    assert.equal(await page.locator('#standupDate').inputValue(), '2026-09-29');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.waitForFunction(date => document.querySelector('#standupDate').value === date && document.querySelector('#today').isContentEditable, today);
    assert.equal(await page.getByRole('button', { name: 'Today', exact: true }).getAttribute('aria-current'), 'date');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('date navigation stays in the header and the save status belongs to the document', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 390, 768, 1280, 1440]) {
      const { page, errors } = await openStandups(browser, width, 900);
      assert.equal(await page.locator('.date-jump').count(), 0, 'No duplicate date pills');
      const layout = await page.evaluate(() => {
        const footer = document.querySelector('.form-actions');
        const style = getComputedStyle(footer);
        return { position: style.position, insideDocument: Boolean(footer.closest('.today-panel')), dateInsideHeader: Boolean(document.querySelector('.date-navigation').closest('#meetingControls')) };
      });
      assert.equal(layout.position, 'static');
      assert.equal(layout.insideDocument, true);
      assert.equal(layout.dateInsideHeader, true);
      if (width <= 760) {
        const actionTops = await page.locator('.meeting-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
        assert.ok(actionTops.every(top => Math.abs(top - actionTops[0]) < 1), `Call controls stay on one row at ${width}px`);
      }
      await assertNoOverflow(page);
      for (const selector of ['#standupDate', '[data-date-step="-1"]', '[data-date-step="1"]', '[data-date-jump="0"]']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.height >= 44, `${selector} fits and is touchable at ${width}px`);
      }
      if ([320, 390, 1440].includes(width)) await page.locator('#meetingControls').screenshot({ path: `/tmp/standup-dates-header-${width}${suffix}.png` });
      if (width === 1440) {
        await page.locator('.form-actions').scrollIntoViewIfNeeded();
        await page.locator('.form-actions').screenshot({ path: `/tmp/standup-save-status${suffix}.png` });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
