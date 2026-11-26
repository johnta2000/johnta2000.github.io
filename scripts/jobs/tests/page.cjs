const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const origin = 'https://jobs-preview.test';
const jobs = [
  { id:'one', name:'Weekly sample', status:'ACTIVE', schedule:'Weekdays', thread:'10000000-0000-4000-8000-000000000001' },
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
    const row = page.locator('#rows li');
    await page.goto(origin + '/tools/jobs/');
    await row.first().waitFor();
    assert.match(await row.innerText(), /Weekly sample/);
    assert.equal(await row.locator('a').first().getAttribute('href'), 'codex://automations/one?automationSource=local&edit=true');
    assert.equal(await row.locator('a').nth(1).getAttribute('href'), 'codex://threads/10000000-0000-4000-8000-000000000001');
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
    await fresh.goto(copied); await fresh.locator('#rows li').waitFor();
    assert.match(await fresh.locator('#rows li').innerText(), /Monthly sample/);
    assert.ok(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await fresh.evaluate(() => window.Clerk.change('outsider'));
    await fresh.getByText(/does not have access/).waitFor();
    assert.equal(await fresh.locator('#rows li').count(),0);
    await fresh.locator('#signout').click();
    assert.equal(await fresh.evaluate(() => window.Clerk.redirect), copied);
    await fresh.evaluate(() => window.Clerk.change('owner'));
    await fresh.locator('#rows li').waitFor();
    assert.equal(await fresh.locator('#search').inputValue(),'monthly');
    await fresh.locator('#search').fill('missing');
    await fresh.getByText('No matching jobs.').waitFor();
    await fresh.locator('#signout').click();
    assert.equal(await fresh.locator('#rows li').count(),0);
    assert.ok(await fresh.locator('#inventory').isHidden());
  } finally { await browser.close(); }
});
