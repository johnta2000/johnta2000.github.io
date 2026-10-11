const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;

test('View notes opens an empty state instead of leaving a waiting cursor on dates without imports', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [390, 1440]) {
      const { page, errors, mutations } = await openStandups(browser, width, 900);
      const button = page.getByRole('button', { name: 'View notes', exact: true });
      await page.waitForFunction(() => document.querySelector('#notetakerViewButton').getAttribute('aria-busy') === 'false');
      assert.equal(await button.isEnabled(), true);
      assert.notEqual(await button.evaluate(node => getComputedStyle(node).cursor), 'wait');
      await button.click();
      await page.locator('#notetakerModal').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#notetakerModalContent').textContent(), 'No meeting notes imported for this date yet.');
      await page.getByRole('button', { name: 'Close notetaker notes' }).press('Escape');
      assert.equal(await page.locator('#notetakerModal').isVisible(), false);
      assert.equal(await button.evaluate(node => node === document.activeElement), true);
      assert.deepEqual(mutations, []);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('imported summaries and action items open promptly and the notes dialog can be reopened', async () => {
  const browser = await browserType.launch();
  try {
    const note = { title: 'Synthetic planning meeting', startedAt: '2026-10-09T18:00:00Z', shareUrl: 'https://example.com/recording', html: '<div><strong>Fathom: Synthetic planning meeting</strong></div><div><strong>Summary</strong></div><ul>' + Array.from({ length: 80 }, (_, i) => `<li>**Plan ${i}**: review [project](https://example.com/project)</li>`).join('') + '</ul>', actionItems: [{ description: '**Finish** the project', assigneeName: 'Test teammate', playbackUrl: 'https://example.com/moment' }] };
    const { page, errors } = await openStandups(browser, 1440, 900, { fathomNotes: [note] });
    await page.getByRole('button', { name: 'View notes', exact: true }).click();
    await page.locator('#notetakerModal').waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(await page.locator('.notetaker-section-body li').count(), 80);
    assert.match(await page.locator('.notetaker-action-panel').textContent(), /Finish the project/);
    assert.equal(await page.locator('.notetaker-section-body strong').first().textContent(), 'Plan 0');
    await page.getByRole('button', { name: 'Close notetaker notes' }).click();
    await page.getByRole('button', { name: 'View notes', exact: true }).click();
    assert.equal(await page.locator('.notetaker-note-card').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
