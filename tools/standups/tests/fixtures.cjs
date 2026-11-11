const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function openStandups(browser, width, height = 844, { platform, fathomNotes = [], initialPerson = "Jenny", url = "http://localhost/", revenueStore } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width <= 760, hasTouch: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const entries = new Map();
  const comments = [];
  const dayNotes = new Map();
  const revenue = revenueStore || {snapshots:new Map(), targets:new Map(), drafts:new Map()};
  const mutations = [];
  const controls = { failSave: false, saveDelay: 0, loadDelays: new Map(), failRevenueDraft:false, failRevenuePublish:false };
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
    if (endpoint === 'standupRevenue:load') {
      const month=args.date.slice(0,7), history=[...revenue.snapshots.values()].filter(row=>row.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));
      value={selected:revenue.snapshots.get(args.date)||null,previous:[...history].reverse().find(row=>row.date<args.date)||null,history,target:revenue.targets.get(month)||null,draft:revenue.drafts.get(args.date)||null};
    } else if (endpoint === 'standupRevenue:saveDraft') {
      if(controls.failRevenueDraft)return route.fulfill({json:{status:'error',errorMessage:'Synthetic revenue draft failure'}});
      const current=revenue.drafts.get(args.date);
      if((current?.version??null)!==args.expectedDraftVersion)return route.fulfill({json:{status:'error',errorMessage:'This draft changed in another tab.'}});
      const version=(current?.version||0)+1;revenue.drafts.set(args.date,{...args,version,updatedAt:Date.now()});value={version};
    } else if (endpoint === 'standupRevenue:publish') {
      if(controls.failRevenuePublish)return route.fulfill({json:{status:'error',errorMessage:'A teammate updated this snapshot. Your draft is safe.'}});
      const current=revenue.snapshots.get(args.date);
      if((current?.version??null)!==args.baseVersion)return route.fulfill({json:{status:'error',errorMessage:'A teammate updated this snapshot.'}});
      const totalCents=['compliance','chase','bofa','bofaMonthly','bilt','nextcard'].reduce((sum,key)=>sum+(args.values[key]??0),0),version=(current?.version||0)+1;
      revenue.snapshots.set(args.date,{date:args.date,values:args.values,totalCents,version,updatedAt:Date.now()});
      revenue.targets.set(args.date.slice(0,7),{targetCents:args.targetCents,version:1});revenue.drafts.delete(args.date);value={version,totalCents};
    } else if (endpoint === 'standups:verify') value = { email: 'a.long.account.address@example.com' };
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
    else if (endpoint === 'standups:listForDate') value = [...entries.values()].filter(e => e.standupDate === args.standupDate);
    else if (endpoint === 'standups:getDayNotes') value = dayNotes.get(args.standupDate) || null;
    else if (endpoint === 'standups:saveDayNotes') { dayNotes.set(args.standupDate, {...args, updatedAt: Date.now()}); value = 'day-notes-1'; }
    else if (endpoint === 'standups:listFathomNotesForDate') value = fathomNotes;
    else if (endpoint.includes('list')) value = [];
    return route.fulfill({ json: { status: 'success', value } });
  });
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#standupsApp').hidden && document.querySelector('#generalPanel').getAttribute('aria-busy') === 'false');
  await page.waitForFunction(() => navigationReady);
  if (url !== 'http://localhost/') return { page, errors, comments, mutations, controls, entries, dayNotes, revenue };
  if (initialPerson === 'General') await page.evaluate(() => selectMeetingPerson('General'));
  else if (width <= 760) await page.evaluate(person => selectMeetingPerson(person), initialPerson);
  if (initialPerson !== 'General') await page.waitForFunction(() => document.querySelector('#today').textContent.includes('Schedule posts') && !document.querySelector('#previousContent').textContent.includes('Looking for'));
  if (width <= 760 && initialPerson !== 'General') await page.locator('#mobileFormat').click();
  return { page, errors, comments, mutations, controls, entries, dayNotes, revenue };
}

async function assertNoOverflow(page) {
  const sizes = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(sizes.document <= sizes.viewport + 1, `Page overflows: ${JSON.stringify(sizes)}`);
}


module.exports = { openStandups, assertNoOverflow };
