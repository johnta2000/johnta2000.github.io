const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups, assertNoOverflow } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const hotkey = letter => `${["S", "F"].includes(letter) ? "Control+Shift" : "Meta+Alt"}+${letter}`;
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
    assert.equal(await page.locator('[data-shortcut-hint="spotlight"]').textContent(), '⌃⇧S');
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
    for (const combination of ['s', 'Meta+s', 'Meta+Alt+s', 'Meta+Alt+Shift+s', 'Meta+Shift+s', 'Control+Meta+Alt+s', 'Control+s', 'Control+Alt+Shift+s']) {
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
        const event = new KeyboardEvent('keydown', { code: 'KeyS', key: 'S', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, bubbles: true, cancelable: true, ...flags });
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
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), 'Control+Shift+F');
    await page.keyboard.press(hotkey('S'));
    assert.equal(await inSpotlight(page), 'false');
    await page.keyboard.press(hotkey('F'));
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#today').getAttribute('aria-disabled') === 'false');
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), 'Control+Shift+F');
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

test('shortcut hints and settings fit tablet and desktop', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [768, 1280]) {
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
    await page.keyboard.press('Control+Alt+S');
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    assert.equal(await page.locator('[data-shortcut-hint="spotlight"]').textContent(), 'Ctrl+Alt+S');
    await page.keyboard.press('Control+Alt+D');
    assert.equal(await page.locator('.comments-card').isVisible(), true);
    await page.locator('#shortcutSettingsButton').click();
    assert.equal(await page.locator('#shortcutModifiers').textContent(), 'Control + Alt');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('existing Mac preferences use the new Spotlight modifiers without resetting custom letters or teammate numbers', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1280, 900, { platform: 'MacIntel' });
    await page.evaluate(() => localStorage.setItem('standups:call-shortcuts:v1', JSON.stringify({
      enabled: true, letters: { spotlight: 'S', discussions: 'D', next: 'N', previous: 'P' },
      members: { John: '5', Vivek: '2', Vishal: '3', Jenny: '4' },
    })));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#today').isContentEditable);
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), 'Control+Shift+S');
    assert.equal(await page.locator('[data-person-jump=John]').getAttribute('aria-keyshortcuts'), 'Meta+Alt+5');
    await page.locator('#shortcutSettingsButton').focus();
    await page.keyboard.press('Meta+Alt+S');
    assert.equal(await inSpotlight(page), 'false');
    await page.keyboard.press('Control+Shift+S');
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    await page.keyboard.press('Control+Shift+S');
    await page.getByRole('button', { name: 'Spotlight', exact: true }).waitFor();
    await page.locator('#shortcutSettingsButton').click();
    assert.equal(await page.locator('#spotlightShortcutModifiers').innerText(), 'Control + Shift');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('shortcut settings dismiss on the backdrop and preserve a draft through dismissal on desktop and phone', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1280);
    for (const width of [1280, 390]) {
      await page.locator('#shortcutSettingsButton').click();
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#shortcutSpotlight').fill('F');
      await page.locator('#shortcutDialog h2').click();
      assert.equal(await page.locator('#shortcutDialog').isVisible(), true);
      const box = await page.locator('#shortcutDialog h2').boundingBox();
      await page.mouse.move(box.x + 4, box.y + 4);
      await page.mouse.down(); await page.mouse.move(4, 4); await page.mouse.up();
      assert.equal(await page.locator('#shortcutDialog').isVisible(), true);
      await page.mouse.click(4, 4);
      assert.equal(await page.locator('#shortcutDialog').isVisible(), false);
      await page.setViewportSize({ width:1280, height:900 });
      await page.locator('#shortcutSettingsButton').click();
      assert.equal(await page.locator('#shortcutSpotlight').inputValue(), 'F');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#shortcutSettingsButton').evaluate(el => el === document.activeElement), true);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
