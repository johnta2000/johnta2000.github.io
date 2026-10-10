const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function openStandups(browser, width, height = 844, { platform } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width <= 760, hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const entries = new Map();
  const comments = [];
  const mutations = [];
  const controls = { failSave: false, saveDelay: 0, loadDelays: new Map() };
  if (platform) await page.addInitScript(platform => Object.defineProperty(navigator, 'platform', { value: platform }), platform);
  await page.addInitScript(() => {
    localStorage.setItem('standups:last-person-name', 'Jenny');
      window.__internal_ClerkUICtor = {};
    window.Clerk = { load: async () => {}, isSignedIn: true,
      session: { getToken: async () => 'test-token' } };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') {
      if (url.pathname.startsWith('/assets/')) return route.fulfill({ body: await fs.readFile(path.join(__dirname, '../../..', url.pathname)), contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
      const name = url.pathname.endsWith('/') ? 'index.html' : path.basename(url.pathname);
      let body = await fs.readFile(path.join(__dirname, '..', name), 'utf8');
      if (name === 'index.html') body = body.replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, '');
      return route.fulfill({ body, contentType: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html' });
    }
    if (!url.hostname.endsWith('.convex.cloud')) return route.abort();
    const { path: endpoint, args } = route.request().postDataJSON();
    const key = `${args.personName}:${args.standupDate}`;
    let value = null;
    if (url.pathname.endsWith('/mutation')) mutations.push({ endpoint, args });
    if (endpoint === 'standups:verify') value = { email: 'a.long.account.address@example.com' };
    else if (endpoint === 'standups:getForPersonAndDate') {
      const delay = controls.loadDelays.get(args.personName) || 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      value = entries.get(key) || {
      personName: args.personName, standupDate: args.standupDate, updatedAt: Date.now(),
      yesterday: '<ul><li>Reviewed launch plans</li></ul>', today: '<ul><li>Schedule posts for the week</li><li>Review campaign strategy</li></ul>', blockers: '', notes: '',
    };
    } else if (endpoint === 'standups:getPreviousForPerson') value = { personName: args.personName, standupDate: '2026-09-14', today: '<ul><li>Follow up on the previous plan</li></ul>' };
    else if (endpoint === 'standups:save') {
      if (controls.saveDelay) await new Promise(resolve => setTimeout(resolve, controls.saveDelay));
      if (controls.failSave) return route.fulfill({ json: { status: 'error', errorMessage: 'Synthetic save failure' } });
      entries.set(key, { ...args, updatedAt: Date.now() }); value = 'entry-1';
    }
    else if (endpoint === 'standups:saveItemComment') {
      value = `comment-${comments.length}`;
      comments.push({ ...args, _id: value, personKey: args.personName.toLowerCase(), authorEmail: 'tester@example.com', createdAt: Date.now() });
    } else if (endpoint === 'standups:listItemComments') value = comments.filter(c => c.personName === args.personName && c.standupDate === args.standupDate);
    else if (endpoint.includes('list')) value = [];
    return route.fulfill({ json: { status: 'success', value } });
  });
  await page.goto('http://localhost/');
  await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Schedule posts') && !document.querySelector('#previousContent').textContent.includes('Looking for'));
  return { page, errors, comments, mutations, controls, entries };
}

async function assertNoOverflow(page) {
  const sizes = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(sizes.document <= sizes.viewport + 1, `Page overflows: ${JSON.stringify(sizes)}`);
}


module.exports = { openStandups, assertNoOverflow };
