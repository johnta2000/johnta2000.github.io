const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const origin = 'https://jobs-preview.test';
const jobs = [
  { id:'one', name:'Weekly sample', status:'ACTIVE', schedule:'Weekdays · 9:00 AM PT', thread:'10000000-0000-4000-8000-000000000001' },
  { id:'second-active', name:'Yearly inventory review', status:'ACTIVE', schedule:'Every 6 hours' },
  { id:'two', name:'Monthly sample', status:'PAUSED', schedule:'Monthly' },
];

for (const width of [390, 1280]) test('Private inventory and URL navigation at width ' + width, async () => {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const ctx = await browser.newContext({ viewport:{ width, height:820 } });
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        const name = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
        return route.fulfill({ path:path.join(root, name) });
      }
      if (url.pathname === '/api/query') {
        const allowed = route.request().headers().authorization === 'Bearer owner';
        return route.fulfill({ json:allowed ? {status:'success',value:{jobs,checkedAt:1700000000000}} :
          {status:'error',errorData:'Owner access required'} });
      }
      return route.fulfill({body:''});
    });
    await ctx.addInitScript(() => {
      window.__internal_ClerkUICtor = {};
      const makeSession = id => id ? {id,getToken:async () => id} : null;
      window.Clerk = {session:makeSession('owner'), async load(){},
        addListener(fn){this.listener=fn;}, mountSignIn(_,opts){this.redirect=opts.forceRedirectUrl;}, unmountSignIn(){},
        change(id){this.session=makeSession(id);this.listener({session:this.session});},
        async signOut(){this.change(null);}
      };
    });
    const page = await ctx.newPage();
    const row = page.locator('#rows tr').first();
    await page.goto(origin + '/tools/jobs/');
    await row.first().waitFor();
    assert.match(await row.innerText(), /Weekly sample/);
    assert.equal(await row.locator('a').first().getAttribute('href'), 'codex://automations/one?automationSource=local&edit=true');
    assert.equal(await row.locator('a').nth(1).getAttribute('href'), 'codex://threads/10000000-0000-4000-8000-000000000001');
    assert.equal(await row.locator('.frequency').innerText(), 'Weekdays');
    assert.match(await row.locator('.time').innerText(), /9:00 AM/);
    const desktop = width > 760;
    assert.equal(await page.locator('.time-heading').isVisible(), desktop);
    assert.equal(await page.locator('.no-time').isVisible(), desktop);
    const cells = await row.locator('th,td').evaluateAll(items => items.map(el => {
      const r = el.getBoundingClientRect();
      return { x:r.x, y:r.y };
    }));
    if (desktop) assert.ok(cells.every((c,i) => c.y === cells[0].y && (!i || c.x > cells[i-1].x)));
    else assert.ok(cells.every((c,i) => c.x === cells[0].x && (!i || c.y > cells[i-1].y)));
    await page.locator('#sort-name').click();
    assert.match(await row.innerText(), /Yearly inventory review/);
    await page.reload(); await row.waitFor();
    assert.match(await row.innerText(), /Yearly inventory review/);
    await page.goBack();
    assert.match(await row.innerText(), /Weekly sample/);
    await page.locator('#paused').click();
    assert.match(await row.innerText(), /Monthly sample/);
    await page.locator('#search').fill('monthly');
    await page.waitForURL(url => url.hash === '#q=monthly', {timeout:3000});
    const copied = page.url();
    assert.match(copied, /status=paused#q=monthly$/);
    await page.goBack();
    assert.equal(await page.locator('#search').inputValue(), '');
    await page.goBack();
    assert.match(await row.innerText(), /Weekly sample/);
    await page.goForward(); await page.goForward();
    await page.reload(); await row.first().waitFor();
    assert.equal(await page.locator('#search').inputValue(), 'monthly');
    const fresh = await ctx.newPage();
    await fresh.goto(copied); await fresh.locator('#rows tr').waitFor();
    assert.match(await fresh.locator('#rows tr').innerText(), /Monthly sample/);
    assert.ok(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await fresh.evaluate(() => window.Clerk.change('outsider'));
    await fresh.getByText(/does not have access/).waitFor();
    assert.equal(await fresh.locator('#rows tr').count(),0);
    await fresh.locator('#signout').click();
    assert.equal(await fresh.evaluate(() => window.Clerk.redirect), copied);
    await fresh.evaluate(() => window.Clerk.change('owner'));
    await fresh.locator('#rows tr').waitFor();
    assert.equal(await fresh.locator('#search').inputValue(),'monthly');
    await fresh.locator('#search').fill('missing');
    await fresh.getByText('No matching jobs.').waitFor();
    await fresh.locator('#signout').click();
    assert.equal(await fresh.locator('#rows tr').count(),0);
    assert.ok(await fresh.locator('#inventory').isHidden());
  } finally { await browser.close(); }
});
