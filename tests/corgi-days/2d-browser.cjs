const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const base = process.env.CORGI_BASE || 'http://127.0.0.1:8794/games/corgi-days/';
  for (const width of [1360, 390, 320]) {
    const context = await browser.newContext({viewport:{width,height:900}, isMobile:width<700, hasTouch:width<700});
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    await page.goto(base + '?view=home&v=4&mode=rotate&az=2.1&el=.5&zoom=7');
    await page.locator('[data-ready=true]').waitFor();
    for (const key of ['mode','az','el','zoom']) assert.equal(new URL(page.url()).searchParams.has(key),false);
    assert.equal(await page.locator('canvas').count(),0);
    assert.equal(await page.locator('#pet svg').count(),1);
    await page.locator('#pet').click();
    assert.equal(await page.locator('#corgi-stage').getAttribute('data-mood'),'cuddle');
    for (const action of ['feed','play','wash','sleep']) {
      await page.locator(`[data-action=${action}]`).click();
      assert.equal(await page.locator('#corgi-stage').getAttribute('data-mood'),action);
    }
    const original = await page.evaluate(()=>JSON.parse(localStorage.getItem('corgi-days-v1')));
    await page.locator('.nav a[href="?view=wardrobe"]').click();
    await page.locator('#name').fill('Little loaf');
    for (const coat of ['golden','tricolor','cocoa','cream']) {
      await page.locator(`[data-value=${coat}]`).click();
      for (const accessory of ['none','bandana','bow','crown','flower']) {
        await page.locator(`[data-value=${accessory}]`).click();
        assert.equal(await page.locator('#corgi-stage [data-accessory]:visible').count(),accessory==='none'?0:1);
      }
    }
    await page.locator('#color').evaluate(el=>{el.value='#aa77bb';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.locator('#corgi-stage').evaluate(el=>el.style.getPropertyValue('--accessory')),'#aa77bb');
    await page.locator('.primary').click();
    await page.reload();
    assert.ok((await page.locator('.pet-heading').innerText()).includes('Little loaf'));
    assert.equal(await page.locator('.count').innerText(),'4 / 4');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('corgi-days-v1')));
    assert.deepEqual(saved.days,original.days);assert.equal(saved.biscuits,original.biscuits);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(!requests.some(url=>/three\.module|corgi-3d|plush-/.test(url)));
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.corgi').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.deepEqual(errors,[]);
    await context.close();console.log(`${width}px: 2D artwork, 20 outfits, care reactions, old links and saved progress passed.`);
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
