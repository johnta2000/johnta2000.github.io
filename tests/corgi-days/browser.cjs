const {accountFixture,savedPet}=require('./account-fixture.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const base=process.env.CORGI_BASE||'http://127.0.0.1:8794/games/corgi-days/';
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:1000},isMobile:mobile,hasTouch:mobile});
    const store=await accountFixture(context);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'?view=wardrobe');await page.locator('#adopt-form').waitFor();assert.ok(page.url().includes('view=adopt'));
    await page.locator('#name').fill('Waffles');await page.locator('[data-value=cocoa]').click();await page.reload();
    assert.equal(await page.locator('#name').inputValue(),'Waffles');assert.equal(await page.locator('[data-value=cocoa]').getAttribute('aria-pressed'),'true');
    const adoptionCopy=await context.newPage();await adoptionCopy.goto(page.url());assert.equal(await adoptionCopy.locator('#name').inputValue(),'Waffles');await adoptionCopy.close();
    await page.screenshot({path:`outputs/corgi-days-qa/adoption-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    await page.locator('#adopt-form .primary').click();await page.locator('#style-form').waitFor();await page.locator('.nav a[href="?view=home"]').click();
    const start=await savedPet(page,store);assert.equal(start.adopted,true);assert.equal(start.accessory,'none');
    await page.goto(base+'?view=adopt');await page.locator('.pet-heading').waitFor();assert.ok(page.url().includes('view=home'));
    await page.locator('.settings-link').click();assert.equal(await page.locator('#calendar-reminder').count(),0);
    await page.locator('#name').fill('Potato');await page.locator('[data-value=cream]').click();
    await page.locator('.nav a[href="?view=wardrobe"]').click();assert.equal(await page.locator('#name').count(),0);assert.equal(await page.locator('[data-style=coat]').count(),0);
    await page.locator('[data-value=bow]').click();await page.locator('#style-form .primary').click();
    assert.ok((await page.locator('.pet-heading').innerText()).includes('Waffles'));
    await page.locator('.settings-link').click();assert.equal(await page.locator('#name').inputValue(),'Potato');
    await page.reload();assert.equal(await page.locator('#name').inputValue(),'Potato');await page.locator('#identity-form .primary').click();
    const updated=await savedPet(page,store);assert.equal(updated.name,'Potato');assert.equal(updated.accessory,'bow');assert.equal(updated.created,start.created);
    await page.locator('[data-action=feed]').click();await page.reload();assert.equal(await page.locator('.count').innerText(),'1 / 4');
    for(const a of ['play','wash','sleep'])await page.locator(`[data-action=${a}]`).click();assert.equal(await page.locator('.coin').innerText(),'✿ 40 biscuits');
    const completedPet = JSON.stringify(await savedPet(page,store));
    await page.reload();
    for (const action of ['feed','feed','play','wash','sleep']) {
      const button = page.locator(`[data-action="${action}"]`);
      if (mobile) await button.tap(); else await button.click();
      assert.equal(await page.locator('#corgi-stage').getAttribute('data-mood'), action);
      assert.notEqual(await page.locator('#bubble').innerText(), 'My wish came true! ♡');
      assert.equal(JSON.stringify(await savedPet(page,store)), completedPet);
    }
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => [...document.fonts].some(f => f.family.includes('Quicksand') && f.status === 'loaded')));
    await page.locator('.reminder-prompt a').click();await page.locator('#calendar-reminder').waitFor();assert.ok(page.url().endsWith('#reminders'));
    await page.locator('#reminder-time').fill('18:15');await page.reload();assert.equal(await page.locator('#reminder-time').inputValue(),'18:15');
    const download=page.waitForEvent('download');await page.locator('#calendar-reminder').click();const calendar=await download;assert.ok((await fs.readFile(await calendar.path(),'utf8')).includes('RRULE:FREQ=DAILY'));
    for(const v of ['home','wardrobe','journal','settings']){
      await page.goto(base+'?view='+v);await page.reload();const copy=await context.newPage();await copy.goto(page.url());await copy.locator('main .card').last().waitFor();
      assert.equal(new URL(copy.url()).searchParams.get('view'),v);assert.ok(await copy.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await copy.close();
    }
    await page.goto(base+'?view=home');await page.locator('.settings-link').click();await page.locator('.nav a[href="?view=wardrobe"]').click();
    await page.goBack();await page.locator('#identity-form').waitFor();await page.goForward();await page.locator('#style-form').waitFor();
    await page.goto(base+'?view=settings');const d=page.waitForEvent('download');await page.locator('#backup').click();const backup=await d;
    await page.locator('#name').fill('Changed');await page.locator('#identity-form .primary').click();await page.locator('.settings-link').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#restore').setInputFiles(await backup.path());
    await page.locator('.pet-heading').waitFor();assert.ok((await page.locator('.pet-heading').innerText()).includes('Potato'));assert.equal(await page.locator('.count').innerText(),'4 / 4');
    assert.deepEqual(errors,[]);await context.close();console.log((mobile?'Mobile':'Desktop')+': adoption, independent drafts, identity, reminders, all routes, history and backup restore passed.');
  }
  const c=await browser.newContext(), store=await accountFixture(c), p=await c.newPage();
  await p.goto(base);await p.locator('#adopt-form').waitFor();
  await p.evaluate(async()=>{const m=await import('./model.mjs');const pet=m.act(m.fresh(),'feed');pet.name='Old friend';localStorage.setItem('corgi-days-v1',JSON.stringify(pet));});
  await p.reload();await p.getByRole('button',{name:'Bring my corgi'}).click();
  await p.locator('.pet-heading').waitFor();assert.equal((await savedPet(p,store)).name,'Old friend');
  store.offline=true;await p.locator('[data-action=play]').click();await p.getByRole('button',{name:'Retry save'}).waitFor();
  assert.equal(await p.locator('.count').innerText(),'2 / 4');
  store.offline=false;await p.getByRole('button',{name:'Retry save'}).click();await p.locator('#sync').waitFor({state:'hidden'});
  await p.locator('.settings-link').click();await p.locator('#music-enabled').check();
  await p.locator('#music-volume').fill('42');assert.deepEqual((await savedPet(p,store)).music,{enabled:true,volume:42});
  const d=await browser.newContext();await accountFixture(d,store);const other=await d.newPage();await other.goto(base+'?view=settings');
  assert.equal(await other.locator('#name').inputValue(),'Old friend');assert.ok(await other.locator('#music-enabled').isChecked());
  assert.equal(await other.locator('#music-volume').inputValue(),'42');
  await other.locator('#name').fill('Cloud pet');await other.locator('#identity-form .primary').click();await savedPet(other,store);
  await p.locator('#name').fill('Local edit');await p.getByRole('button',{name:'Use account version'}).waitFor();
  assert.equal(JSON.parse(store.data).pet.name,'Cloud pet');
  const guest=await browser.newContext();await accountFixture(guest,undefined,false);const g=await guest.newPage();await g.goto(base+'?view=journal');
  await g.getByText('Sign in',{exact:true}).waitFor();assert.equal(await g.locator('#pet,.journal').count(),0);
  assert.equal(new URL(g.url()).searchParams.get('view'),'journal');
  await browser.close();console.log('Sign-in gate, import, cross-device save, offline retry, music and conflict recovery passed.');
})().catch(e=>{console.error(e);process.exit(1)});
