const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { openStandups, assertNoOverflow } = require('./fixtures.cjs');
const browserType = process.env.STANDUPS_BROWSER === 'webkit' ? webkit : chromium;

async function selectText(page, editor, text) {
  await page.locator(editor).evaluate((node, text) => {
    node.focus();
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let part;
    while ((part = walker.nextNode())) {
      const start = part.textContent.indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(part, start); range.setEnd(part, start + text.length);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      return;
    }
    throw new Error(`Cannot find selection: ${text}`);
  }, text);
}

async function choosePerson(page, name) {
  if (await page.locator('#personName-trigger').isVisible()) {
    await page.locator('#personName-trigger').click();
    await page.getByRole('combobox', { name: 'Search team member' }).fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  } else {
    await page.locator(`[data-person-jump="${name}"]`).click();
  }
  await page.waitForFunction(name => document.querySelector('#todayTitle').textContent === `${name}'s updates` && document.querySelector('#today').isContentEditable, name);
}

test('document toolbar keeps the selected section, formatting states, links, undo and saved content', async () => {
  const browser = await browserType.launch();
  try {
    const { page, mutations, errors } = await openStandups(browser, 1440, 1000);
    const toolbar = page.locator('#documentToolbar');
    await selectText(page, '#yesterday', 'Reviewed launch plans');
    await toolbar.getByRole('button', { name: 'Italic', exact: true }).click();
    await page.locator('#yesterday i, #yesterday em').waitFor();
    assert.equal(await toolbar.getByRole('button', { name: 'Italic', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#today i, #today em').count(), 0);
    await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.equal(await page.locator('#yesterday i, #yesterday em').count(), 0);
    await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.locator('#yesterday i, #yesterday em').waitFor();
    await toolbar.getByRole('button', { name: 'Underline', exact: true }).click();
    await page.locator('#yesterday u').waitFor();
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('dialog', { name: 'Insert link' }).waitFor();
    await page.locator('#linkUrl').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Apply link' }).click();
    assert.equal(await page.locator('#linkDialog').isVisible(), true);
    assert.equal(await page.locator('#yesterday a').count(), 0);
    await page.locator('#linkUrl').fill('https://example.com/launch');
    await page.getByRole('button', { name: 'Apply link' }).click();
    assert.equal(await page.locator('#yesterday a').textContent(), 'Reviewed launch plans');
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    const saved = mutations.filter(m => m.endpoint === 'standups:save').at(-1).args;
    assert.ok(saved.yesterday.includes('https://example.com/launch'));
    assert.ok(/<(i|em)>/.test(saved.yesterday));
    assert.ok(saved.yesterday.includes('<u>'));
    await page.reload();
    await page.locator('#yesterday a').waitFor();
    assert.equal(await page.locator('#yesterday a').getAttribute('rel'), 'noopener noreferrer');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Google Docs paste keeps useful formatting and strips foreign layout and unsafe markup', async () => {
  const browser = await browserType.launch();
  try {
    const { page, mutations, errors } = await openStandups(browser, 1280);
    await page.locator('#notes').focus();
    await page.locator('#notes').evaluate(node => {
      const data = new DataTransfer();
      data.setData('text/html', '<b style="font-weight:normal" id="docs-internal-guid-test"><p><span style="font-weight:700">Bold plan</span> and <span style="font-style:italic;text-decoration:underline">linked context</span></p><ul><li>One action</li><li>Another action</li></ul><a href="javascript:alert(1)" onclick="alert(1)">Unsafe link</a><script>window.pasteAttack = true</script><style>body{display:none}</style></b>');
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.locator('#notes strong').textContent(), 'Bold plan');
    assert.equal(await page.locator('#notes u').textContent(), 'linked context');
    assert.equal(await page.locator('#notes li').count(), 2);
    assert.equal(await page.locator('#notes script, #notes style, #notes [style], #notes [onclick], #notes a[href]').count(), 0);
    assert.equal(await page.evaluate(() => window.pasteAttack), undefined);
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    assert.ok(mutations.filter(m => m.endpoint === 'standups:save').at(-1).args.notes.includes('<strong>Bold plan</strong>'));
    await assertNoOverflow(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('changing a person or date immediately after typing saves to the original document', async () => {
  const browser = await browserType.launch();
  try {
    const { page, mutations, errors } = await openStandups(browser, 390);
    const originalDate = await page.locator('#standupDate').inputValue();
    await page.locator('#today').fill('Jenny draft before switching');
    await choosePerson(page, 'John');
    assert.ok(mutations.some(m => m.endpoint === 'standups:save' && m.args.personName === 'Jenny' && m.args.today.includes('Jenny draft before switching')));
    await page.locator('#today').fill('John draft before changing date');
    await page.locator('#standupDate').fill('2026-09-22');
    await page.waitForFunction(() => document.querySelector('#today').isContentEditable && document.querySelector('#today').textContent.includes('Schedule posts'));
    assert.ok(mutations.some(m => m.endpoint === 'standups:save' && m.args.personName === 'John' && m.args.standupDate === originalDate && m.args.today.includes('John draft before changing date')));
    await page.locator('#standupDate').fill(originalDate);
    await page.waitForFunction(() => document.querySelector('#today').textContent.includes('John draft before changing date'));
    await choosePerson(page, 'Jenny');
    assert.equal(await page.locator('#today').textContent(), 'Jenny draft before switching');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('person picker supports search, empty results and keyboard selection on compact screens', async () => {
  const browser = await browserType.launch();
  try {
    for (const width of [320, 768]) {
      const { page, errors } = await openStandups(browser, width);
      await page.locator('#personName-trigger').click();
      const search = page.getByRole('combobox', { name: 'Search team member' });
      await search.fill('No matching teammate');
      await page.getByText('No matches. Try another search.', { exact: true }).waitFor();
      await search.fill('Vivek');
      await search.press('Enter');
      await page.waitForFunction(() => document.querySelector('#todayTitle').textContent === "Vivek's updates" && document.querySelector('#today').isContentEditable);
      assert.match(await page.locator('#personName-trigger').textContent(), /Vivek/);
      await page.locator('#personName-trigger').click();
      const box = await page.locator('#personName-panel').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      await search.press('Escape');
      assert.equal(await page.locator('#personName-trigger').evaluate(node => node === document.activeElement), true);
      await assertNoOverflow(page);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('failed saves retain the draft and allow retry before changing people', async () => {
  const browser = await browserType.launch();
  try {
    const { page, controls, errors } = await openStandups(browser, 390);
    controls.failSave = true;
    await page.locator('#today').fill('Keep this draft when the connection fails');
    await page.locator('#personName-trigger').click();
    await page.getByRole('combobox', { name: 'Search team member' }).fill('John');
    await page.getByRole('option', { name: 'John', exact: true }).click();
    await page.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
    assert.equal(await page.locator('#personName').inputValue(), 'Jenny');
    assert.equal(await page.locator('#today').textContent(), 'Keep this draft when the connection fails');
    assert.equal(await page.locator('#today').getAttribute('contenteditable'), 'true');
    controls.failSave = false;
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    await choosePerson(page, 'John');
    await choosePerson(page, 'Jenny');
    assert.equal(await page.locator('#today').textContent(), 'Keep this draft when the connection fails');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('slow saves preserve newer edits and slow person loads cannot replace a newer choice', async () => {
  const browser = await browserType.launch();
  try {
    const { page, controls, entries, errors } = await openStandups(browser, 1280);
    controls.saveDelay = 1000;
    const firstSave = page.waitForRequest(request => request.url().endsWith('/api/mutation') && request.postDataJSON().path === 'standups:save');
    await page.locator('#today').fill('First version');
    await firstSave;
    await page.locator('#today').fill('Latest version while a save is in flight');
    await choosePerson(page, 'John');
    const date = await page.locator('#standupDate').inputValue();
    assert.ok(entries.get(`Jenny:${date}`).today.includes('Latest version while a save is in flight'));
    controls.loadDelays.set('Vivek', 650);
    await page.locator('[data-person-jump="Vivek"]').click();
    const olderLoad = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postDataJSON()?.path === 'standups:getForPersonAndDate' && response.request().postDataJSON()?.args.personName === 'Vivek');
    await choosePerson(page, 'Jenny');
    await olderLoad;
    assert.equal(await page.locator('#todayTitle').textContent(), "Jenny's updates");
    assert.equal(await page.locator('#today').textContent(), 'Latest version while a save is in flight');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('clearing all sections persists instead of restoring the old content', async () => {
  const browser = await browserType.launch();
  try {
    const { page, errors } = await openStandups(browser, 1280);
    await page.locator('#yesterday').fill('');
    await page.locator('#today').fill('');
    await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Last saved'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#today').isContentEditable);
    assert.equal(await page.locator('#yesterday').textContent(), '');
    assert.equal(await page.locator('#today').textContent(), '');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
