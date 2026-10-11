const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups, assertNoOverflow } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const hotkey = letter => `Meta+Alt+Shift+${letter}`;
const inSpotlight = page => page.locator('#spotlightToggle').getAttribute('aria-pressed');

test('mnemonic call shortcuts switch states and teammates; Escape dismisses one layer', async () => {
  const browser = await browserType.launch();
  try {
    const { page, mutations, errors } = await openStandups(browser, 1440, 900);
    await page.locator('#shortcutSettingsButton').focus();
    await page.keyboard.press(hotkey('D'));
    assert.equal(await inSpotlight(page), 'false', 'Discussions shortcut only applies in Spotlight');
    await page.keyboard.press(hotkey('S'));
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    assert.equal(await page.locator('[data-shortcut-hint="spotlight"]').textContent(), '⌘⌥⇧S');
    await page.keyboard.press(hotkey('D'));
    assert.equal(await page.locator('.comments-card').isVisible(), true);
    await page.keyboard.press(hotkey('D'));
    assert.equal(await page.locator('.comments-card').isVisible(), false);
    await page.keyboard.press(hotkey('N'));
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "John's updates" && document.querySelector('#today').getAttribute('aria-disabled') === 'false');
    await page.keyboard.press(hotkey('P'));
    await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "Jenny's updates" && document.querySelector('#today').getAttribute('aria-disabled') === 'false');
    await page.keyboard.press(hotkey('D'));
    await page.locator('#shortcutSettingsButton').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#shortcutDialog').isVisible(), false);
    assert.equal(await page.locator('.comments-card').isVisible(), true, 'Closing dialog does not hide discussions');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.comments-card').isVisible(), false);
    assert.equal(await inSpotlight(page), 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Spotlight', exact: true }).waitFor();
    assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'true');
    assert.equal(mutations.length, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('call shortcuts leave editing, composition, menus and already-handled events alone', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 768);
    await page.locator('#today').focus();
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    await page.keyboard.press(hotkey('N'));
    assert.equal(await page.locator('#personName').inputValue(), 'Jenny');
    await page.locator('#dailyNotes').focus();
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    await page.locator('#shortcutSettingsButton').focus();
    for (const combination of ['s', 'Meta+s', 'Meta+Alt+s', 'Meta+Shift+s', 'Control+Meta+Alt+Shift+s']) {
      // Synthetic dispatch avoids invoking browser Save for deliberately unmatched combinations.
      const parts = combination.split('+');
      const consumed = await page.evaluate(parts => {
        const event = new KeyboardEvent('keydown', { code: 'KeyS', key: 's', bubbles: true, cancelable: true,
          metaKey: parts.includes('Meta'), altKey: parts.includes('Alt'), shiftKey: parts.includes('Shift'), ctrlKey: parts.includes('Control') });
        document.querySelector('#shortcutSettingsButton').dispatchEvent(event);
        return event.defaultPrevented;
      }, parts);
      assert.equal(consumed, false);
      assert.equal(await inSpotlight(page), 'false');
    }
    for (const flags of [{ repeat: true }, { isComposing: true }, { handled: true }]) {
      await page.evaluate(flags => {
        const event = new KeyboardEvent('keydown', { code: 'KeyS', key: 'S', metaKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true, ...flags });
        if (flags.handled) event.preventDefault();
        document.querySelector('#shortcutSettingsButton').dispatchEvent(event);
      }, flags);
      assert.equal(await inSpotlight(page), 'false');
    }
    await page.locator('.search-select-trigger').click();
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.search-select-trigger').getAttribute('aria-expanded'), 'false');
    await page.locator('#shortcutSettingsButton').click();
    await page.locator('#shortcutSpotlight').focus();
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('shortcut letters are remappable, validated, persisted and can be disabled', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1280);
    await page.locator('#shortcutSettingsButton').click();
    await page.locator('#shortcutSpotlight').fill('D');
    await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
    assert.ok((await page.locator('#shortcutError').textContent()).includes('different letter'));
    await page.locator('#shortcutSpotlight').fill('Q');
    await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
    assert.ok((await page.locator('#shortcutError').textContent()).includes('reserved'));
    await page.locator('#shortcutSpotlight').fill('f');
    await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), 'Meta+Alt+Shift+F');
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    await page.keyboard.press(hotkey('F'));
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#today').getAttribute('aria-disabled') === 'false');
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), 'Meta+Alt+Shift+F');
    await page.locator('#shortcutSettingsButton').click();
    await page.locator('#shortcutsEnabled').uncheck();
    await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
    await page.keyboard.press(hotkey('F'));
    assert.equal(await inSpotlight(page), 'false');
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), null);
    await page.locator('#shortcutSettingsButton').click();
    await page.getByRole('button', { name: 'Reset defaults', exact: true }).click();
    await page.getByRole('button', { name: 'Save shortcuts', exact: true }).click();
    await page.keyboard.press(hotkey('S'));
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('shortcut hints and settings fit phone, tablet and desktop', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 390, 768, 1280]) {
      const { page, errors } = await openStandups(browser, width, 900);
      await page.locator('#spotlightToggle').click();
      await page.locator('#spotlightCommentsToggle').click();
      await assertNoOverflow(page);
      await page.locator('#shortcutSettingsButton').click();
      await assertNoOverflow(page);
      const box = await page.locator('#shortcutDialog').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 900);
      if (width === 390 || width === 1280) await page.screenshot({ path: `/tmp/standups-shortcuts-${width}.png` });
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('comment replies retain drafts and Escape closes the thread before the sidebar', async () => {
  const browser = await browserType.launch();
  try {
    const fixture = await openStandups(browser, 1280);
    const { page, comments, errors } = fixture;
    comments.push({ _id: 'shortcut-thread', personName: 'Jenny', personKey: 'jenny', standupDate: await page.locator('#standupDate').inputValue(), fieldName: 'today', itemKey: 'shortcut-item', itemText: 'Schedule posts for the week', comment: 'Discuss this during the call', authorEmail: 'test@example.com', createdAt: Date.now() });
    await page.evaluate(() => reloadItemComments());
    await page.locator('#spotlightToggle').click();
    await page.keyboard.press(hotkey('D'));
    await page.locator('#commentsOverview button').filter({ hasText: 'Discuss this during the call' }).click();
    await page.locator('.comment-thread-panel:visible textarea').fill('Keep my reply draft');
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'true');
    await page.keyboard.press(hotkey('N'));
    assert.equal(await page.locator('#personName').inputValue(), 'Jenny');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.comment-thread-panel:visible').count(), 0);
    assert.equal(await page.locator('.comments-card').isVisible(), true);
    await page.locator('#commentsOverview button').filter({ hasText: 'Discuss this during the call' }).click();
    assert.equal(await page.locator('.comment-thread-panel:visible textarea').inputValue(), 'Keep my reply draft');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('non-Mac keyboards use Control instead of Command and show matching hints', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1280, 900, { platform: 'Win32' });
    await page.locator('#shortcutSettingsButton').focus();
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    await page.keyboard.press('Control+Alt+Shift+S');
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    assert.equal(await page.locator('[data-shortcut-hint="spotlight"]').textContent(), 'Ctrl+Alt+Shift+S');
    await page.keyboard.press('Control+Alt+Shift+D');
    assert.equal(await page.locator('.comments-card').isVisible(), true);
    await page.locator('#shortcutSettingsButton').click();
    assert.equal(await page.locator('#shortcutModifiers').textContent(), 'Control + Alt + Shift');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
