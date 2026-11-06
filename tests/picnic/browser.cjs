// Run with: node tests/picnic/browser.cjs (serve the site on localhost:8786 first).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, devices } = require('playwright');
const BASE = process.env.PICNIC_BASE_URL || 'http://127.0.0.1:8786/games/picnic/';
const KEY = 'pepsi-pepper-picnic-v1';
const OUTPUT = 'outputs/picnic-qa';
fs.mkdirSync(OUTPUT, { recursive: true });

async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY); }
async function fits(page, label) {
  const dimensions = await page.evaluate(() => {
    const panel = document.querySelector('.paper-panel');
    const stage = document.getElementById('stage').getBoundingClientRect();
    const rect = panel?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth > innerWidth, clipped: rect && (rect.top < stage.top - 1 || rect.bottom > stage.bottom + 1) };
  });
  assert.equal(dimensions.overflow, false, `${label}: horizontal overflow`);
  assert.ok(!dimensions.clipped, `${label}: clipped card`);
}
async function start(page) { await page.getByRole('button', { name: /Let’s catch some treats|Back to the picnic/ }).click(); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => { Math.random = () => .5; });
    const page = await context.newPage();page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.goto(BASE);
    await fits(page, 'desktop home');
    await page.screenshot({ path: `${OUTPUT}/desktop-home.png`, fullPage: true });
    await page.getByRole('link', { name: 'How to play' }).click();
    assert.match(page.url(), /view=help/);await fits(page, 'desktop help');
    await page.goBack();assert.equal(new URL(page.url()).search, '');
    await page.goForward();assert.match(page.url(), /view=help/);
    await page.getByRole('link', { name: 'Got it, let’s go' }).click();
    await page.getByRole('link', { name: 'Let’s picnic' }).click();
    await start(page);
    await page.clock.runFor(5000);
    await page.getByRole('button', { name: 'Pause game' }).click();
    const checkpoint = (await stored(page)).runs[1];
    assert.ok(checkpoint.elapsed >= 4.9 && checkpoint.caught > 0);
    await page.clock.runFor(5000);
    assert.equal((await stored(page)).runs[1].elapsed, checkpoint.elapsed, 'paused timer must not move');
    await page.reload();
    assert.ok(await page.getByRole('heading', { name: 'A little pause.' }).isVisible());
    assert.equal((await stored(page)).runs[1].caught, checkpoint.caught);
    // Clicking inside a pause card must not dismiss it; clicking the backdrop does.
    await page.getByRole('heading', { name: 'A little pause.' }).click();
    assert.ok(await page.getByRole('heading', { name: 'A little pause.' }).isVisible());
    await page.locator('#screen').click({ position: { x: 8, y: 8 } });
    assert.equal(await page.locator('.paper-panel').count(), 0);
    await page.keyboard.press('Escape');
    assert.ok(await page.getByRole('heading', { name: 'A little pause.' }).isVisible());
    await page.keyboard.press('Escape');
    await page.keyboard.down('ArrowLeft');await page.clock.runFor(1000);await page.keyboard.up('ArrowLeft');
    assert.ok((await stored(page)).runs[1].basket < .3, 'keyboard moves the blanket');
    const board = await page.locator('canvas').boundingBox();
    await page.mouse.move(board.x + board.width / 2, board.y + board.height * .7);
    await page.clock.runFor(31000);
    assert.match(page.url(), /view=result&level=1/);
    assert.equal((await stored(page)).results[1].won, true);
    await fits(page, 'desktop result');
    for (let level = 2; level <= 5; level++) {
      await page.getByRole('link', { name: 'Next picnic' }).click();
      assert.match(page.url(), new RegExp(`view=play&level=${level}`));
      await start(page);await page.clock.runFor(31000);
      if (level === 2) {
        assert.match(page.url(), /view=guest&level=2&from=play/);
        assert.ok(await page.getByRole('heading', { name: 'You found Pee!' }).isVisible());
        assert.equal((await stored(page)).peeUnlocked, true);
        await fits(page, 'desktop Pee reveal');
        const discovery = (await stored(page)).runs[2];
        await page.clock.runFor(5000);assert.equal((await stored(page)).runs[2].elapsed, discovery.elapsed);
        await page.getByRole('heading', { name: 'You found Pee!' }).click();assert.match(page.url(), /view=guest/);
        const panel = await page.locator('.guest-panel').boundingBox();
        const stage = await page.locator('#stage').boundingBox();
        await page.mouse.move(panel.x+30,panel.y+30);await page.mouse.down();
        await page.mouse.move(stage.x+5,stage.y+5);await page.mouse.up();assert.match(page.url(), /view=guest/);
        await page.reload();assert.ok(await page.getByRole('heading', { name: 'You found Pee!' }).isVisible());
        assert.equal((await stored(page)).runs[2].elapsed, discovery.elapsed);
        await page.clock.runFor(50);await page.screenshot({path:`${OUTPUT}/desktop-pee-reveal.png`,fullPage:true});
        await page.getByRole('button',{name:'Close guest reveal'}).click();assert.match(page.url(), /view=play&level=2/);
        assert.equal(await page.evaluate(()=>document.activeElement.id),'scene');
        await page.goBack();assert.match(page.url(),/view=guest/);await page.keyboard.press('Escape');assert.match(page.url(),/view=play/);
        await page.goBack();await page.locator('#screen').click({position:{x:8,y:8}});assert.match(page.url(),/view=play/);
        const meadow = await page.locator('#scene').boundingBox();await page.mouse.move(meadow.x+meadow.width/2,meadow.y+meadow.height*.7);
        await page.clock.runFor(31000);
      }
      assert.equal((await stored(page)).results[level].won, true, `Browser level ${level}`);
    }
    await page.getByRole('link', { name: 'Enjoy our picnic' }).click();
    assert.match(page.url(), /view=picnic/);
    assert.deepEqual((await stored(page)).completed.sort(), [1,2,3,4,5]);
    await page.screenshot({ path: `${OUTPUT}/desktop-finale.png`, fullPage: true });
    console.log('PASS desktop: five levels, final picnic, keyboard, pause/backdrop/Escape, reload, history');

    // Copied links and reload restore every meaningful section in a fresh tab.
    for (const query of ['', '?view=levels', '?view=help', '?view=play&level=4', '?view=result&level=4', '?view=picnic', '?view=guest&level=2&from=picnic']) {
      const copied = await context.newPage();copied.on('pageerror', e => errors.push(e.message));
      await copied.goto(BASE + query);await fits(copied, `fresh tab ${query}`);
      await copied.reload();await fits(copied, `refresh ${query}`);
      if (query.includes('result')) assert.ok(await copied.getByRole('heading', { name: 'So many happy wiggles!' }).isVisible());
      await copied.close();
    }
    // Losing and retrying one level preserves all completed levels.
    await page.goto(BASE + '?view=play&level=2');await start(page);
    const field = await page.locator('canvas').boundingBox();
    await page.mouse.move(field.x + 2, field.y + field.height * .8);
    await page.clock.runFor(31000);
    assert.equal((await stored(page)).results[2].won, false);
    await page.getByRole('button', { name: 'Try this level again' }).click();
    assert.equal((await stored(page)).runs[2].caught, 0);
    assert.equal((await stored(page)).completed.length, 5);
    assert.equal((await stored(page)).peeUnlocked, true, 'Retry must retain Pee');
    console.log('PASS copied links, fresh tabs, refresh, failed round and retry preservation');

    const mobile = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await mobile.addInitScript(() => { Math.random = () => .5; });
    const phone = await mobile.newPage();phone.on('pageerror', e => errors.push(e.message));await phone.clock.install();
    for (const query of ['', '?view=levels', '?view=help', '?view=play&level=3', '?view=result&level=3', '?view=picnic']) {
      await phone.goto(BASE + query);await fits(phone, `mobile ${query}`);
      await phone.screenshot({ path: `${OUTPUT}/mobile-${new URL(phone.url()).searchParams.get('view') || 'home'}.png`, fullPage: true });
      const copied = await mobile.newPage();await copied.goto(phone.url());await fits(copied, `mobile copied ${query}`);await copied.reload();await fits(copied, `mobile refresh ${query}`);await copied.close();
    }
    await phone.goto(BASE);await phone.getByRole('link', { name: 'Let’s picnic' }).click();await start(phone);
    const touchBoard = await phone.locator('canvas').boundingBox();
    const client = await mobile.newCDPSession(phone);
    await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:195,y:touchBoard.y+touchBoard.height*.7}] });
    await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:65,y:touchBoard.y+touchBoard.height*.7}] });
    await phone.clock.runFor(1000);
    await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    assert.ok((await stored(phone)).runs[1].basket < .3, 'touch drag moves the blanket');
    await phone.getByRole('button', {name:'Pause game'}).click();
    const phoneCheckpoint = (await stored(phone)).runs[1];
    await phone.reload();assert.equal((await stored(phone)).runs[1].elapsed, phoneCheckpoint.elapsed);
    await start(phone);
    await client.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:195,y:touchBoard.y+touchBoard.height*.7}]});
    await client.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await phone.clock.runFor(31000);
    assert.equal((await stored(phone)).results[1].won, true);
    await phone.goBack();await fits(phone,'mobile back');await phone.goForward();await fits(phone,'mobile forward');
    await phone.screenshot({path:`${OUTPUT}/mobile-win.png`,fullPage:true});
    assert.equal((await stored(phone)).peeUnlocked, false, 'Level 1 must not unlock Pee');
    await phone.getByRole('link',{name:'Next picnic'}).click();await start(phone);await phone.clock.runFor(12000);
    assert.match(phone.url(),/view=guest&level=2&from=play/);
    await fits(phone,'mobile Pee reveal');await phone.clock.runFor(50);
    await phone.screenshot({path:`${OUTPUT}/mobile-pee-reveal.png`,fullPage:true});
    const peeTime=(await stored(phone)).runs[2].elapsed;await phone.reload();
    assert.equal((await stored(phone)).runs[2].elapsed,peeTime);
    await phone.getByRole('heading',{name:'You found Pee!'}).tap();assert.match(phone.url(),/view=guest/);
    await phone.locator('#screen').tap({position:{x:8,y:8}});assert.match(phone.url(),/view=play&level=2/);
    await phone.getByRole('button',{name:'Pause game'}).tap();
    await phone.goto(BASE+'?view=picnic');await phone.clock.runFor(50);
    assert.ok(await phone.getByRole('link',{name:'Meet Pee, your secret picnic guest'}).isVisible());
    await phone.screenshot({path:`${OUTPUT}/mobile-pee-picnic.png`,fullPage:true});
    await phone.getByRole('link',{name:'Meet Pee, your secret picnic guest'}).tap();assert.match(phone.url(),/view=guest/);
    await phone.getByRole('button',{name:'Back to our picnic'}).tap();assert.match(phone.url(),/view=picnic/);
    const guestTab=await mobile.newPage();await guestTab.goto(BASE+'?view=guest&level=2');
    assert.ok(await guestTab.getByRole('heading',{name:'You found Pee!'}).isVisible());await guestTab.close();
    for (const viewport of [{width:320,height:568},{width:844,height:390}]) {
      await phone.setViewportSize(viewport);
      for (const view of ['help','levels','play','guest']) { await phone.goto(BASE+`?view=${view}&level=5`);await fits(phone,`${viewport.width}px ${view}`); }
    }
    console.log('PASS mobile: touch drag, successful round, saved round, direct links, fresh tabs, refresh, Back/Forward, 320px and landscape');

    const denied = await browser.newContext();
    await denied.addInitScript(() => { Storage.prototype.setItem = function(){throw new DOMException('Full','QuotaExceededError');}; });
    const blocked = await denied.newPage();await blocked.goto(BASE+'?view=play&level=1');await start(blocked);
    assert.ok(await blocked.locator('#save-warning').isVisible());
    await blocked.getByRole('button',{name:'Pause game'}).click();
    assert.ok(await blocked.getByRole('button',{name:'Download progress'}).isVisible());
    const downloadPromise = blocked.waitForEvent('download');await blocked.getByRole('button',{name:'Download progress'}).click();
    const download = await downloadPromise;await download.saveAs(`${OUTPUT}/recovery-progress.json`);
    const recovery=JSON.parse(fs.readFileSync(`${OUTPUT}/recovery-progress.json`,'utf8'));assert.ok(recovery.runs[1]);
    const corrupt = await browser.newContext();
    await corrupt.addInitScript(key => localStorage.setItem(key,'{unreadable'), KEY);
    const broken = await corrupt.newPage();await broken.goto(BASE);assert.ok(await broken.locator('#save-warning').isVisible());
    await broken.getByRole('button',{name:'Turn sound on'}).click();
    assert.equal(await broken.evaluate(key=>localStorage.getItem(key),KEY),'{unreadable');
    console.log('PASS failed storage: visible errors, downloadable recovery, corrupt save preserved');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('ALL PICNIC BROWSER CHECKS PASSED');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
