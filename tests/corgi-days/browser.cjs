const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const base=process.env.CORGI_BASE||'http://127.0.0.1:8794/games/corgi-days/';
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:1000},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'?view=wardrobe');await page.locator('#adopt-form').waitFor();assert.ok(page.url().includes('view=adopt'));
    await page.locator('#name').fill('Waffles');await page.locator('[data-value=cocoa]').click();await page.reload();
    assert.equal(await page.locator('#name').inputValue(),'Waffles');assert.equal(await page.locator('[data-value=cocoa]').getAttribute('aria-pressed'),'true');
    const adoptionCopy=await context.newPage();await adoptionCopy.goto(page.url());assert.equal(await adoptionCopy.locator('#name').inputValue(),'Waffles');await adoptionCopy.close();
    await page.screenshot({path:`outputs/corgi-days-qa/adoption-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    await page.locator('#adopt-form .primary').click();await page.locator('.welcome').waitFor();
    const start=await page.evaluate(()=>JSON.parse(localStorage.getItem('corgi-days-v1')));assert.equal(start.adopted,true);assert.equal(start.accessory,'none');
    await page.goto(base+'?view=adopt');assert.ok(page.url().includes('view=home'));
    await page.locator('.settings-link').click();assert.equal(await page.locator('#calendar-reminder').count(),0);
    await page.locator('#name').fill('Potato');await page.locator('[data-value=cream]').click();
    await page.locator('.nav a[href="?view=wardrobe"]').click();assert.equal(await page.locator('#name').count(),0);assert.equal(await page.locator('[data-style=coat]').count(),0);
    await page.locator('[data-value=bow]').click();await page.locator('#style-form .primary').click();
    assert.ok((await page.locator('.pet-heading').innerText()).includes('Waffles'));
    await page.locator('.settings-link').click();assert.equal(await page.locator('#name').inputValue(),'Potato');
    await page.reload();assert.equal(await page.locator('#name').inputValue(),'Potato');await page.locator('#identity-form .primary').click();
    const updated=await page.evaluate(()=>JSON.parse(localStorage.getItem('corgi-days-v1')));assert.equal(updated.name,'Potato');assert.equal(updated.accessory,'bow');assert.equal(updated.created,start.created);
    await page.locator('[data-action=feed]').click();await page.reload();assert.equal(await page.locator('.count').innerText(),'1 / 4');
    for(const a of ['play','wash','sleep'])await page.locator(`[data-action=${a}]`).click();assert.equal(await page.locator('.coin').innerText(),'✿ 40 biscuits');
    await page.locator('.reminder-prompt a').click();await page.locator('#calendar-reminder').waitFor();assert.ok(page.url().endsWith('#reminders'));
    await page.locator('#reminder-time').fill('18:15');await page.reload();assert.equal(await page.locator('#reminder-time').inputValue(),'18:15');
    const download=page.waitForEvent('download');await page.locator('#calendar-reminder').click();const calendar=await download;assert.ok((await fs.readFile(await calendar.path(),'utf8')).includes('RRULE:FREQ=DAILY'));
    for(const v of ['home','wardrobe','journal','settings']){
      await page.goto(base+'?view='+v);await page.reload();const copy=await context.newPage();await copy.goto(page.url());
      assert.equal(new URL(copy.url()).searchParams.get('view'),v);assert.ok(await copy.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await copy.close();
    }
    await page.goto(base+'?view=home');await page.locator('.settings-link').click();await page.locator('.nav a[href="?view=wardrobe"]').click();
    await page.goBack();await page.locator('#identity-form').waitFor();await page.goForward();await page.locator('#style-form').waitFor();
    await page.goto(base+'?view=settings');const d=page.waitForEvent('download');await page.locator('#backup').click();const backup=await d;
    await page.locator('#name').fill('Changed');await page.locator('#identity-form .primary').click();await page.locator('.settings-link').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#restore').setInputFiles(await backup.path());
    await page.locator('.pet-heading').waitFor();assert.ok((await page.locator('.pet-heading').innerText()).includes('Potato'));assert.equal(await page.locator('.count').innerText(),'4 / 4');
    assert.deepEqual(errors,[]);await context.close();console.log((mobile?'Mobile':'Desktop')+': adoption, independent drafts, identity, reminders, all routes, history and backup restore passed.');
  }
  // Upgrade a real-shaped pre-setup save without resetting its identity or care.
  const c=await browser.newContext();const p=await c.newPage();await p.goto(base);
  const legacy=await p.evaluate(async()=>{const m=await import('./model.mjs');let pet=m.act(m.fresh(),'feed');pet.name='Old friend';localStorage.setItem('corgi-days-v1',JSON.stringify(pet));localStorage.setItem('corgi-days-style-v1',JSON.stringify({...pet,name:'Draft friend',accessory:'crown'}));localStorage.removeItem('corgi-days-editors-v1');return pet;});
  await p.reload();assert.equal(await p.locator('#adopt-form').count(),0);assert.equal(await p.locator('.count').innerText(),'1 / 4');
  const migrated=await p.evaluate(()=>JSON.parse(localStorage.getItem('corgi-days-v1')));assert.deepEqual(migrated,{...legacy,adopted:true});
  await p.locator('.settings-link').click();assert.equal(await p.locator('#name').inputValue(),'Draft friend');await p.locator('.nav a[href="?view=wardrobe"]').click();assert.equal(await p.locator('[data-value=crown]').getAttribute('aria-pressed'),'true');
  // Saving failures retain work and show a retry; a successful retry makes it durable.
  await p.locator('.nav a[href="?view=home"]').click();await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='corgi-days-v1')throw Error('test quota');return window.originalSet.call(this,k,v);};});
  await p.locator('[data-action=play]').click();await p.locator('[role=alert]').waitFor();assert.equal(await p.locator('.count').innerText(),'2 / 4');
  await p.evaluate(()=>Storage.prototype.setItem=window.originalSet);await p.locator('#retry').click();await p.reload();assert.equal(await p.locator('.count').innerText(),'2 / 4');
  await c.close();await browser.close();console.log('Legacy migration and failed-save recovery passed.');
})().catch(e=>{console.error(e);process.exit(1)});
