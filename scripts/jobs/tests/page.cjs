const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const origin = 'https://jobs-preview.test';
const jobs = [
  { id:'one', name:'Weekly sample', status:'ACTIVE', schedule:'Weekdays · 9:00 AM PT', thread:'10000000-0000-4000-8000-000000000001' },
  { id:'second-active', name:'Yearly inventory review', status:'ACTIVE', schedule:'Every 6 hours' },
  { id:'two', name:'Monthly sample', status:'PAUSED', schedule:'Every month · day 1 · 2:00 PM PT' },
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
    const rows = page.locator('#rows tr');
    const names = () => rows.locator('.job-name').allTextContents();
    const sort = key => page.locator('[data-sort="' + key + '"]').click();
    assert.deepEqual(await rows.locator('.status').allTextContents(), ['Active','Active','Inactive']);
    assert.equal(await page.locator('#count').innerText(), '3 jobs');
    const sheet = page.locator('.sheet');
    assert.equal(await sheet.evaluate(el => el.scrollWidth > el.clientWidth), width < 760);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const left = (await row.locator('th').boundingBox()).x;
    await sheet.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    assert.ok(Math.abs((await row.locator('th').boundingBox()).x - left) < 2);
    await sheet.evaluate(el => { el.scrollLeft = 0; });

    await sort('name');
    assert.deepEqual(await names(), ['Monthly sample','Weekly sample','Yearly inventory review']);
    await sort('name');
    assert.deepEqual(await names(), ['Yearly inventory review','Weekly sample','Monthly sample']);
    await sort('time');
    assert.deepEqual(await names(), ['Weekly sample','Monthly sample','Yearly inventory review']);
    await sort('time');
    assert.deepEqual(await names(), ['Monthly sample','Weekly sample','Yearly inventory review']);
    await sort('frequency');
    assert.deepEqual(await names(), ['Yearly inventory review','Monthly sample','Weekly sample']);
    await sort('status'); await sort('status');
    assert.equal(await row.locator('.status').innerText(), 'Inactive');
    await page.reload(); await row.waitFor();
    assert.equal(await row.locator('.status').innerText(), 'Inactive');
    await page.locator('#search').fill('active');
    assert.deepEqual(await rows.locator('.status').allTextContents(), ['Active','Active']);
    await page.locator('#search').fill('inactive');
    await page.waitForURL(url => url.hash === '#q=inactive');
    assert.equal(await rows.count(), 1);
    const copied = page.url();
    await page.goBack();
    assert.equal(await rows.count(), 3);
    await page.goForward();
    assert.equal(await rows.count(), 1);
    const fresh = await ctx.newPage();
    await fresh.goto(origin + '/tools/jobs/?status=paused');
    await fresh.locator('#rows tr').waitFor();
    assert.equal(await fresh.locator('#rows tr').count(),1);
    await fresh.getByRole('link',{name:'Show all jobs'}).click();
    assert.equal(await fresh.locator('#rows tr').count(),3);
    await fresh.goto(copied); await fresh.locator('#rows tr').waitFor();
    assert.match(await fresh.locator('#rows tr').innerText(), /Monthly sample/);
    await fresh.evaluate(() => window.Clerk.change('outsider'));
    await fresh.getByText(/does not have access/).waitFor();
    assert.equal(await fresh.locator('#rows tr').count(),0);
    await fresh.locator('#signout').click();
    assert.equal(await fresh.evaluate(() => window.Clerk.redirect), copied);
    await fresh.evaluate(() => window.Clerk.change('owner'));
    await fresh.locator('#rows tr').waitFor();
    assert.equal(await fresh.locator('#search').inputValue(),'inactive');
    await fresh.locator('#search').fill('missing');
    await fresh.getByText('No matching jobs.').waitFor();
    await fresh.locator('#signout').click();
    assert.equal(await fresh.locator('#rows tr').count(),0);
    assert.ok(await fresh.locator('#inventory').isHidden());
  } finally { await browser.close(); }
});
