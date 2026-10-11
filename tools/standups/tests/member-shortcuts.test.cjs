const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;
const waitPerson = (page, name) => page.waitForFunction(name => document.querySelector('#personName').value === name && document.querySelector('#today').getAttribute('aria-disabled') === 'false', name);

test('Command Option numbers select teammates directly in editing and Spotlight, preserving drafts', async () => {
  const browser = await browserType.launch();
  try {
    const { page, entries, errors } = await openStandups(browser, 1280);
    const date = await page.locator('#standupDate').inputValue();
    await page.locator('#today').fill('Preserve Jenny draft');
    await page.locator('#shortcutSettingsButton').focus();
    for (const [digit, name] of [['1','John'],['2','Vivek'],['3','Vishal'],['4','Jenny']]) {
      await page.keyboard.press(`Meta+Alt+Digit${digit}`);
      await waitPerson(page, name);
      const button = page.locator(`[data-person-jump="${name}"]`);
      assert.equal(await button.getAttribute('aria-keyshortcuts'), `Meta+Alt+${digit}`);
      assert.equal(await button.locator('kbd').textContent(), digit);
    }
    assert.ok(entries.get(`Jenny:${date}`).today.includes('Preserve Jenny draft'));
    await page.locator('#spotlightToggle').click();
    await page.getByRole('button', { name: 'Exit spotlight', exact: true }).waitFor();
    await page.keyboard.press('Meta+Alt+Digit2');
    await waitPerson(page, 'Vivek');
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#spotlightToggle').click();
    await page.locator('#today').focus();
    await page.keyboard.press('Meta+Alt+Digit1');
    assert.equal(await page.locator('#personName').inputValue(), 'Vivek');
    await page.locator('#shortcutSettingsButton').focus();
    for (const flags of [{ repeat: true }, { isComposing: true }, { handled: true }, { shiftKey: true }, { ctrlKey: true }, { altKey: false }]) {
      const consumed = await page.evaluate(flags => {
        const event = new KeyboardEvent('keydown', { code: 'Digit1', key: '¡', metaKey: true, altKey: true, bubbles: true, cancelable: true, ...flags });
        if (flags.handled) event.preventDefault();
        document.querySelector('#shortcutSettingsButton').dispatchEvent(event);
        return event.defaultPrevented;
      }, flags);
      assert.equal(consumed, Boolean(flags.handled));
      assert.equal(await page.locator('#personName').inputValue(), 'Vivek');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('teammate numbers are validated, remappable, persisted, disabled and reset', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1440);
    await page.locator('#shortcutSettingsButton').click();
    await page.locator('#shortcutMemberJohn').fill('2');
    await page.getByRole('button', { name: 'Save shortcuts' }).click();
    assert.match(await page.locator('#shortcutError').textContent(), /different number/);
    await page.locator('#shortcutMemberJohn').fill('5');
    await page.getByRole('button', { name: 'Save shortcuts' }).click();
    await page.keyboard.press('Meta+Alt+Digit1');
    assert.equal(await page.locator('#personName').inputValue(), 'Jenny');
    await page.keyboard.press('Meta+Alt+Digit5');
    await waitPerson(page, 'John');
    await page.reload();
    await waitPerson(page, 'Jenny');
    assert.equal(await page.locator('[data-person-jump="John"]').getAttribute('aria-keyshortcuts'), 'Meta+Alt+5');
    await page.locator('#shortcutSettingsButton').click();
    await page.locator('#shortcutsEnabled').uncheck();
    await page.getByRole('button', { name: 'Save shortcuts' }).click();
    await page.keyboard.press('Meta+Alt+Digit5');
    assert.equal(await page.locator('#personName').inputValue(), 'Jenny');
    assert.equal(await page.locator('[data-person-jump="John"]').getAttribute('aria-keyshortcuts'), null);
    await page.locator('#shortcutSettingsButton').click();
    await page.getByRole('button', { name: 'Reset defaults' }).click();
    await page.getByRole('button', { name: 'Save shortcuts' }).click();
    await page.keyboard.press('Meta+Alt+Digit1');
    await waitPerson(page, 'John');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('existing shortcut preferences migrate and Windows uses Control Alt numbers', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1280, 900, { platform: 'Win32' });
    await page.evaluate(() => localStorage.setItem('standups:call-shortcuts:v1', JSON.stringify({ enabled: true, letters: { spotlight: 'F', discussions: 'D', next: 'N', previous: 'P' } })));
    await page.reload();
    await waitPerson(page, 'Jenny');
    assert.equal(await page.locator('#spotlightToggle').getAttribute('aria-keyshortcuts'), 'Control+Alt+Shift+F');
    await page.locator('#shortcutSettingsButton').focus();
    await page.keyboard.press('Control+Alt+Digit3');
    await waitPerson(page, 'Vishal');
    assert.equal(await page.locator('[data-person-jump="Vishal"]').getAttribute('aria-keyshortcuts'), 'Control+Alt+3');
    await page.locator('#shortcutSettingsButton').click();
    assert.equal(await page.locator('#memberShortcutModifiers').textContent(), 'Control + Alt');
    await page.keyboard.press('Control+Alt+Digit1');
    assert.equal(await page.locator('#personName').inputValue(), 'Vishal');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
